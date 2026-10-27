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

const SESSION_MS = 8000;

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

function createReader(socket: net.Socket) {
  let pending = Buffer.alloc(0);
  const waiters: { resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
  const take = () => {
    let start = 0;
    while (start < pending.length) {
      const newline = pending.indexOf(0x0a, start);
      if (newline < 0) return "";
      const line = pending.subarray(start, newline).toString("latin1").replace(/\r$/, "");
      if (/^\d{3} /.test(line)) {
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
  const reply = await read();
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

function connectMail(host: string, port: number, implicitTls: boolean) {
  return new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    let settled = false;
    const next = implicitTls
      ? tls.connect({ host, port, servername: host }, () => {
        settled = true;
        resolve(next);
      })
      : net.connect({ host, port, autoSelectFamily: true }, () => {
        settled = true;
        resolve(next);
      });
    next.setTimeout(SESSION_MS);
    next.once("timeout", () => {
      if (settled) return;
      next.destroy();
      reject(new Error("The mail server took too long."));
    });
    next.once("error", (error) => {
      if (!settled) reject(error instanceof Error ? error : new Error("Email could not be sent."));
    });
  });
}

async function upgrade(socket: net.Socket, host: string) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host }, () => resolve(secure));
    secure.once("error", reject);
  });
}

function messageIdentity(messageId: string, from: string) {
  const cleaned = messageId.replace(/[<>\s]/g, "");
  const domain = cleaned.split("@")[1] || "";
  if (domain.includes(".")) return cleaned;
  const local = cleaned.split("@")[0] || "sauticall";
  return `${local}@${ehloName(from)}`;
}

export async function sendMail(message: OutboundMail) {
  const from = mailboxAddress(message.from);
  const recipients = message.to.map((item) => mailboxAddress(item));
  if (!message.host || !from || recipients.some((item) => !item)) return { ok: false, message: "Outgoing email is not set up." };
  const port = message.port || 587;
  const implicitTls = message.secure || port === 465;
  let socket: net.Socket | tls.TLSSocket | null = null;
  try {
    socket = await connectMail(message.host, port, implicitTls);
    socket.setTimeout(SESSION_MS, () => {
      socket?.destroy(new Error("The mail server took too long."));
    });
    let reader = createReader(socket);
    await expectOk(reader.read, "Greeting");
    const helloName = ehloName(from);
    write(socket, `EHLO ${helloName}`);
    const hello = await expectOk(reader.read, "Hello");
    if (!implicitTls && /STARTTLS/i.test(hello)) {
      write(socket, "STARTTLS");
      await expectOk(reader.read, "Secure connection");
      const leftover = reader.unread();
      reader.stop();
      if (leftover.length) socket.unshift(leftover);
      socket = await upgrade(socket, message.host);
      socket.setTimeout(SESSION_MS, () => {
        socket?.destroy(new Error("The mail server took too long."));
      });
      reader = createReader(socket);
      write(socket, `EHLO ${helloName}`);
      await expectOk(reader.read, "Hello");
    }
    if (message.user) {
      write(socket, "AUTH LOGIN");
      await expectOk(reader.read, "Sign-in");
      write(socket, Buffer.from(message.user).toString("base64"));
      await expectOk(reader.read, "Sign-in");
      write(socket, Buffer.from(message.pass).toString("base64"));
      await expectOk(reader.read, "Sign-in");
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
