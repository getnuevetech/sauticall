import dns from "dns/promises";
import net from "net";
import tls from "tls";

export type OutboundMail = {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  from: string;
  to: string[];
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
};

export const MAIL_REPLY_MS = 20000;

const SESSION_MS = MAIL_REPLY_MS;
const CONNECT_MS = 10000;

export function mailTransport(port: number, secure: boolean): "plain" | "tls" {
  if (port === 465) return "tls";
  if (port === 587 || port === 25 || port === 2525) return "plain";
  return secure ? "tls" : "plain";
}

export function mailAttempts(port: number, secure: boolean): Array<"plain" | "tls"> {
  const first = mailTransport(port, secure);
  return [first, first === "tls" ? "plain" : "tls"];
}

function retryTransport(message: string) {
  if (/was refused by the mail server/i.test(message)) return false;
  if (/took too long during /i.test(message) && !/during Greeting/i.test(message)) return false;
  return true;
}

async function mailTargets(host: string) {
  const ip = net.isIP(host);
  if (ip === 4 || ip === 6) return [{ address: host, family: ip as 4 | 6 }];
  try {
    const found = await dns.lookup(host, { all: true });
    const ranked = found
      .filter((item) => item.family === 4 || item.family === 6)
      .sort((left, right) => left.family - right.family)
      .slice(0, 2);
    if (ranked.length) return ranked.map((item) => ({ address: item.address, family: item.family as 4 | 6 }));
  } catch {
    return [{ address: host, family: 4 as const }];
  }
  return [{ address: host, family: 4 as const }];
}

export function mailboxAddress(value: string) {
  const trimmed = value.trim();
  const wrapped = trimmed.match(/<([^<>\s]+@[^<>\s]+)>/);
  const candidate = (wrapped?.[1] || trimmed).replace(/^mailto:/i, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
}

export function ehloName(from: string) {
  const domain = mailboxAddress(from).split("@")[1]?.toLowerCase() || "";
  return /^[a-z0-9.-]+$/.test(domain) && domain.includes(".") ? domain : "sauticall.com";
}

function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function commandCode(reply: string) {
  const lines = reply.split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1] || "";
  return Number(last.slice(0, 3)) || 0;
}

function replyFinished(line: string) {
  return /^\d{3}( |$)/.test(line);
}

function authMechanisms(hello: string) {
  const names = hello.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^250(?:-| )AUTH\s+(.+)$/i);
    return match ? match[1].toUpperCase().split(/\s+/) : [];
  });
  return new Set(names.filter(Boolean));
}

function createReader(socket: net.Socket) {
  let pending = Buffer.alloc(0);
  const waiters: { resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
  const take = () => {
    let start = 0;
    while (start < pending.length) {
      const newline = pending.indexOf(0x0a, start);
      if (newline < 0) return "";
      const line = pending.subarray(start, newline).toString("latin1").replace(/\r$/, "");
      if (replyFinished(line)) {
        const reply = pending.subarray(0, newline).toString("latin1").replace(/\r$/, "");
        pending = pending.subarray(newline + 1);
        return reply;
      }
      start = newline + 1;
    }
    return "";
  };
  const fail = (error: Error) => {
    while (waiters.length) waiters.shift()?.reject(error);
  };
  const onData = (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (waiters.length) {
      const reply = take();
      if (!reply) break;
      waiters.shift()?.resolve(reply);
    }
  };
  const onClose = () => fail(new Error("The mail server closed the connection."));
  socket.on("data", onData);
  socket.on("error", fail);
  socket.on("close", onClose);
  function read() {
    const ready = take();
    if (ready) return Promise.resolve(ready);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The mail server took too long.")), SESSION_MS);
      waiters.push({
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }
  return {
    read,
    unread() {
      const leftover = pending;
      pending = Buffer.alloc(0);
      return leftover;
    },
    stop() {
      socket.off("data", onData);
      socket.off("error", fail);
      socket.off("close", onClose);
    },
  };
}

async function expectOk(read: () => Promise<string>, label: string) {
  let reply = "";
  try {
    reply = await read();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "The mail server took too long.") throw new Error(`The mail server took too long during ${label}.`);
    throw error;
  }
  const code = commandCode(reply);
  if (code < 200 || code >= 400) {
    const detail = reply.replace(/[\r\n]+/g, " ").trim().slice(0, 300);
    throw new Error(`${label} was refused by the mail server: ${detail}`);
  }
  return reply;
}

function write(socket: net.Socket, line: string) {
  socket.write(`${line}\r\n`);
}

function connectMail(address: string, family: 4 | 6, port: number, implicitTls: boolean, hostname: string) {
  return new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    let settled = false;
    const servername = net.isIP(hostname) ? undefined : hostname;
    const next = implicitTls
      ? tls.connect({ host: address, port, servername }, () => {
        settled = true;
        resolve(next);
      })
      : net.connect({ host: address, port, family }, () => {
        settled = true;
        resolve(next);
      });
    next.setTimeout(CONNECT_MS);
    next.once("timeout", () => {
      if (settled) return;
      next.destroy();
      reject(new Error("The mail server took too long to accept the connection."));
    });
    next.once("error", (error) => {
      if (!settled) reject(error instanceof Error ? error : new Error("Email could not be sent."));
    });
  });
}

async function upgrade(socket: net.Socket, host: string) {
  socket.pause();
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const servername = net.isIP(host) ? undefined : host;
    const secure = tls.connect({ socket, servername }, () => resolve(secure));
    secure.once("error", reject);
  });
}

async function authLogin(socket: net.Socket, read: () => Promise<string>, user: string, pass: string) {
  write(socket, "AUTH LOGIN");
  await expectOk(read, "Sign-in");
  write(socket, Buffer.from(user).toString("base64"));
  await expectOk(read, "Sign-in");
  write(socket, Buffer.from(pass).toString("base64"));
  await expectOk(read, "Sign-in");
}

async function authPlain(socket: net.Socket, read: () => Promise<string>, user: string, pass: string) {
  write(socket, "AUTH PLAIN");
  await expectOk(read, "Sign-in");
  write(socket, Buffer.from(`\0${user}\0${pass}`).toString("base64"));
  await expectOk(read, "Sign-in");
}

function messageIdentity(messageId: string, from: string) {
  const cleaned = messageId.replace(/[<>\s]/g, "");
  const domain = cleaned.split("@")[1] || "";
  if (domain.includes(".")) return cleaned;
  const local = cleaned.split("@")[0] || "sauticall";
  return `${local}@${ehloName(from)}`;
}

async function deliverMail(message: OutboundMail, target: { address: string; family: 4 | 6 }, implicitTls: boolean) {
  const from = mailboxAddress(message.from);
  const recipients = message.to.map((item) => mailboxAddress(item));
  let socket: net.Socket | tls.TLSSocket | null = null;
  try {
    socket = await connectMail(target.address, target.family, message.port || 587, implicitTls, message.host);
    socket.setTimeout(SESSION_MS, () => {
      socket?.destroy(new Error("The mail server took too long."));
    });
    let reader = createReader(socket);
    await expectOk(reader.read, "Greeting");
    const helloName = ehloName(from);
    write(socket, `EHLO ${helloName}`);
    let hello = await expectOk(reader.read, "Hello");
    if (!implicitTls && /STARTTLS/i.test(hello)) {
      write(socket, "STARTTLS");
      await expectOk(reader.read, "Secure connection");
      const leftover = reader.unread();
      reader.stop();
      socket.pause();
      if (leftover.length) socket.unshift(leftover);
      socket = await upgrade(socket, message.host);
      socket.setTimeout(SESSION_MS, () => {
        socket?.destroy(new Error("The mail server took too long."));
      });
      reader = createReader(socket);
      write(socket, `EHLO ${helloName}`);
      hello = await expectOk(reader.read, "Hello");
    }
    if (message.user) {
      const offered = authMechanisms(hello);
      if (offered.has("PLAIN")) await authPlain(socket, reader.read, message.user, message.pass);
      else await authLogin(socket, reader.read, message.user, message.pass);
    }
    write(socket, `MAIL FROM:<${from}>`);
    await expectOk(reader.read, "Sender");
    for (const recipient of recipients) {
      write(socket, `RCPT TO:<${recipient}>`);
      await expectOk(reader.read, "Recipient");
    }
    write(socket, "DATA");
    await expectOk(reader.read, "Message");
    const subject = oneLine(message.subject).slice(0, 180);
    const fromHeader = message.from.includes("<") ? oneLine(message.from) : `SautiCall <${from}>`;
    const references = message.inReplyTo ? `In-Reply-To: <${oneLine(message.inReplyTo)}>\r\nReferences: <${oneLine(message.inReplyTo)}>\r\n` : "";
    const body = message.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const identity = messageIdentity(message.messageId, from);
    socket.write(
      `From: ${fromHeader}\r\nTo: ${recipients.join(", ")}\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\nMessage-ID: <${identity}>\r\n${references}MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}\r\n.\r\n`,
    );
    await expectOk(reader.read, "Delivery");
    write(socket, "QUIT");
    socket.end();
    return { ok: true, message: "Email sent." };
  } catch (error) {
    socket?.destroy();
    const detail = error instanceof Error ? error.message : "Email could not be sent.";
    return { ok: false, message: detail.replace(/\s+/g, " ").trim().slice(0, 400) };
  }
}

export async function sendMail(message: OutboundMail) {
  const from = mailboxAddress(message.from);
  const recipients = message.to.map((item) => mailboxAddress(item));
  if (!message.host || !from || recipients.some((item) => !item)) return { ok: false, message: "Outgoing email is not set up." };
  const port = message.port || 587;
  const targets = await mailTargets(message.host);
  let last = "Email could not be sent.";
  for (const mode of mailAttempts(port, message.secure)) {
    for (const target of targets) {
      const result = await deliverMail({ ...message, port }, target, mode === "tls");
      if (result.ok) return result;
      last = result.message;
      if (!retryTransport(result.message)) return result;
    }
  }
  return { ok: false, message: last };
}
