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

function commandCode(reply: string) {
  const lines = reply.split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1] || "";
  return Number(last.slice(0, 3)) || 0;
}

function createReader(socket: net.Socket) {
  let pending = "";
  const waiters: { resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
  const take = () => {
    const lines = pending.split(/\r?\n/);
    let end = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (/^\d{3} /.test(lines[index])) end = index;
    }
    if (end < 0) return "";
    const reply = lines.slice(0, end + 1).join("\r\n");
    pending = lines.slice(end + 1).join("\n");
    return reply;
  };
  const onData = (chunk: Buffer) => {
    pending += chunk.toString("utf8");
    while (waiters.length) {
      const reply = take();
      if (!reply) break;
      waiters.shift()?.resolve(reply);
    }
  };
  const onError = (error: Error) => {
    while (waiters.length) waiters.shift()?.reject(error);
  };
  socket.on("data", onData);
  socket.on("error", onError);
  function read() {
    const ready = take();
    if (ready) return Promise.resolve(ready);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The mail server took too long.")), 20000);
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
    stop() {
      socket.off("data", onData);
      socket.off("error", onError);
    },
  };
}

async function expectOk(read: () => Promise<string>, label: string) {
  const reply = await read();
  const code = commandCode(reply);
  if (code < 200 || code >= 400) throw new Error(`${label} was refused by the mail server.`);
  return reply;
}

function write(socket: net.Socket, line: string) {
  socket.write(`${line}\r\n`);
}

async function upgrade(socket: net.Socket, host: string) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host }, () => resolve(secure));
    secure.once("error", reject);
  });
}

export async function sendMail(message: OutboundMail) {
  if (!message.host || !message.from || message.to.length === 0) return { ok: false, message: "Outgoing email is not set up." };
  let socket: net.Socket | tls.TLSSocket | null = null;
  try {
    socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
      const next = message.secure
        ? tls.connect({ host: message.host, port: message.port, servername: message.host }, () => resolve(next))
        : net.connect({ host: message.host, port: message.port }, () => resolve(next));
      next.setTimeout(5000);
      next.once("timeout", () => {
        next.destroy();
        reject(new Error("The mail server took too long."));
      });
      next.once("error", reject);
    });
    let reader = createReader(socket);
    await expectOk(reader.read, "Greeting");
    write(socket, "EHLO sauticall");
    const hello = await expectOk(reader.read, "Hello");
    if (!message.secure && /STARTTLS/i.test(hello)) {
      write(socket, "STARTTLS");
      await expectOk(reader.read, "Secure connection");
      reader.stop();
      socket = await upgrade(socket, message.host);
      reader = createReader(socket);
      write(socket, "EHLO sauticall");
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
    write(socket, `MAIL FROM:<${message.from}>`);
    await expectOk(reader.read, "Sender");
    for (const recipient of message.to) {
      write(socket, `RCPT TO:<${recipient}>`);
      await expectOk(reader.read, "Recipient");
    }
    write(socket, "DATA");
    await expectOk(reader.read, "Message");
    const subject = message.subject.replace(/[\r\n]+/g, " ").slice(0, 180);
    const references = message.inReplyTo ? `In-Reply-To: <${message.inReplyTo}>\r\nReferences: <${message.inReplyTo}>\r\n` : "";
    const body = message.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    socket.write(
      `From: ${message.from}\r\nTo: ${message.to.join(", ")}\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\nMessage-ID: <${message.messageId}>\r\n${references}MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n.\r\n`,
    );
    await expectOk(reader.read, "Delivery");
    write(socket, "QUIT");
    socket.end();
    return { ok: true, message: "Email sent." };
  } catch (error) {
    socket?.destroy();
    return { ok: false, message: error instanceof Error ? error.message : "Email could not be sent." };
  }
}
