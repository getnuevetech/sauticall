import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import net from "net";
import test from "node:test";
import tls from "tls";
import { MAIL_REPLY_MS, ehloName, mailAttempts, mailboxAddress, retryTransport, sendMail } from "../lib/smtp.ts";

test("a mail server reply waits eight seconds and a timeout is not tried again", () => {
  assert.equal(MAIL_REPLY_MS, 8000);
  assert.equal(retryTransport("The mail server took too long during Greeting."), false);
  assert.equal(retryTransport("The mail server took too long to accept the connection."), false);
  assert.equal(retryTransport("Recipient was refused by the mail server: 550 no such user"), false);
  assert.equal(retryTransport("wrong version number"), true);
});

test("port 587 starts in plain text even when secure is checked, and port 465 starts encrypted", () => {
  assert.deepEqual(mailAttempts(587, true), ["plain"]);
  assert.deepEqual(mailAttempts(2525, true), ["plain"]);
  assert.deepEqual(mailAttempts(465, false), ["tls"]);
  assert.deepEqual(mailAttempts(2525, false), ["plain"]);
});

test("the sender address and hello name come from the from line", () => {
  assert.equal(mailboxAddress("Support <hello@sauticall.com>"), "hello@sauticall.com");
  assert.equal(mailboxAddress("hello@sauticall.com"), "hello@sauticall.com");
  assert.equal(mailboxAddress("not an email"), "");
  assert.equal(ehloName("hello@sauticall.com"), "sauticall.com");
  assert.equal(ehloName("SautiCall"), "sauticall.com");
});

type Captured = { lines: string[]; data: string };

function listen(server: net.Server) {
  return new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

function plainServer(rejectRecipient = false) {
  const captured: Captured = { lines: [], data: "" };
  const server = net.createServer((socket) => {
    let buffer = "";
    let dataMode = false;
    let auth = 0;
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 localhost ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      if (dataMode) {
        captured.data += buffer;
        buffer = "";
        if (captured.data.includes("\r\n.\r\n")) {
          dataMode = false;
          reply("250 queued");
        }
        return;
      }
      while (buffer.includes("\n")) {
        const cut = buffer.indexOf("\n");
        const line = buffer.slice(0, cut).replace(/\r$/, "");
        buffer = buffer.slice(cut + 1);
        captured.lines.push(line);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) reply("250-localhost\r\n250 AUTH LOGIN");
        else if (upper.startsWith("AUTH LOGIN")) {
          auth = 1;
          reply("334 VXNlcm5hbWU6");
        } else if (auth === 1) {
          auth = 2;
          reply("334 UGFzc3dvcmQ6");
        } else if (auth === 2) {
          auth = 0;
          reply("235 authenticated");
        } else if (upper.startsWith("MAIL FROM")) reply("250 sender ok");
        else if (upper.startsWith("RCPT TO")) reply(rejectRecipient ? "550 5.1.1 no such user" : "250 recipient ok");
        else if (upper === "DATA") {
          reply("354 start");
          dataMode = true;
        } else if (upper === "QUIT") {
          reply("221 bye");
          socket.end();
        } else reply("250 ok");
      }
    });
  });
  return { server, captured };
}

test("a silent mail server is reported once", async () => {
  const server = net.createServer(() => {});
  const port = await listen(server);
  const started = Date.now();
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port,
      user: "",
      pass: "",
      secure: false,
      from: "hello@sauticall.com",
      to: ["person@example.com"],
      subject: "Confirm",
      text: "code 111222",
      messageId: "sc-silent@sauticall.com",
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /took too long/);
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 12000, `waited ${elapsed}ms`);
  } finally {
    server.close();
  }
});

test("a confirmation is accepted and keeps the code in the message", async () => {
  const { server, captured } = plainServer();
  const port = await listen(server);
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port,
      user: "mailbox",
      pass: "secret",
      secure: false,
      from: "Support <hello@sauticall.com>",
      to: ["person@example.com"],
      subject: "Confirm your SautiCall account",
      text: "Or enter this code: 123456\n.\nNext line",
      messageId: "sc-verify-1-abc@sauticall",
    });
    assert.equal(result.ok, true, result.message);
    assert.ok(captured.lines.some((line) => line === "EHLO sauticall.com"));
    assert.ok(captured.lines.some((line) => line === "MAIL FROM:<hello@sauticall.com>"));
    assert.ok(captured.lines.includes(Buffer.from("mailbox").toString("base64")));
    assert.ok(captured.lines.includes(Buffer.from("secret").toString("base64")));
    assert.match(captured.data, /From: Support <hello@sauticall.com>/);
    assert.match(captured.data, /Message-ID: <sc-verify-1-abc@sauticall.com>/);
    assert.match(captured.data, /Or enter this code: 123456/);
    assert.match(captured.data, /\r\n\.\.\r\nNext line/);
  } finally {
    server.close();
  }
});

test("a mail server can answer with the code alone", async () => {
  const server = net.createServer((socket) => {
    let buffer = "";
    let dataMode = false;
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      if (dataMode) {
        if (buffer.includes("\r\n.\r\n")) {
          dataMode = false;
          buffer = "";
          reply("250");
        }
        return;
      }
      while (buffer.includes("\n")) {
        const cut = buffer.indexOf("\n");
        const line = buffer.slice(0, cut).replace(/\r$/, "");
        buffer = buffer.slice(cut + 1);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) reply("250-localhost\r\n250");
        else if (upper.startsWith("MAIL FROM") || upper.startsWith("RCPT TO")) reply("250");
        else if (upper === "DATA") {
          reply("354");
          dataMode = true;
        } else if (upper === "QUIT") {
          reply("221");
          socket.end();
        } else reply("250");
      }
    });
  });
  const port = await listen(server);
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port,
      user: "",
      pass: "",
      secure: false,
      from: "hello@sauticall.com",
      to: ["person@example.com"],
      subject: "Confirm",
      text: "code 111222",
      messageId: "sc-bare@sauticall.com",
    });
    assert.equal(result.ok, true, result.message);
  } finally {
    server.close();
  }
});

test("sign-in uses AUTH PLAIN when that is the mechanism offered", async () => {
  const captured: string[] = [];
  const server = net.createServer((socket) => {
    let buffer = "";
    let dataMode = false;
    let auth = 0;
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 localhost ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      if (dataMode) {
        if (buffer.includes("\r\n.\r\n")) {
          dataMode = false;
          buffer = "";
          reply("250 queued");
        }
        return;
      }
      while (buffer.includes("\n")) {
        const cut = buffer.indexOf("\n");
        const line = buffer.slice(0, cut).replace(/\r$/, "");
        buffer = buffer.slice(cut + 1);
        captured.push(line);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) reply("250-localhost\r\n250 AUTH PLAIN");
        else if (upper === "AUTH PLAIN") {
          auth = 1;
          reply("334");
        } else if (auth === 1) {
          auth = 0;
          reply("235 authenticated");
        } else if (upper.startsWith("MAIL FROM") || upper.startsWith("RCPT TO")) reply("250");
        else if (upper === "DATA") {
          reply("354 start");
          dataMode = true;
        } else if (upper === "QUIT") {
          reply("221 bye");
          socket.end();
        } else reply("250 ok");
      }
    });
  });
  const port = await listen(server);
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port,
      user: "mailbox",
      pass: "secret",
      secure: false,
      from: "hello@sauticall.com",
      to: ["person@example.com"],
      subject: "Confirm",
      text: "code 111222",
      messageId: "sc-plain@sauticall.com",
    });
    assert.equal(result.ok, true, result.message);
    assert.ok(captured.includes("AUTH PLAIN"));
    assert.ok(captured.includes(Buffer.from("\0mailbox\0secret").toString("base64")));
    assert.equal(captured.includes("AUTH LOGIN"), false);
  } finally {
    server.close();
  }
});

test("a refused recipient keeps the mail server reply", async () => {
  const { server } = plainServer(true);
  const port = await listen(server);
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port,
      user: "",
      pass: "",
      secure: false,
      from: "hello@sauticall.com",
      to: ["missing@example.com"],
      subject: "Confirm your SautiCall account",
      text: "code 654321",
      messageId: "sc-verify-2@sauticall.com",
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /550 5.1.1 no such user/);
  } finally {
    server.close();
  }
});

test("port 587 can upgrade with STARTTLS before sign-in", async () => {
  execSync("openssl req -x509 -newkey rsa:2048 -keyout /tmp/smtp-key.pem -out /tmp/smtp-cert.pem -days 1 -nodes -subj /CN=localhost", { stdio: "ignore" });
  const key = fs.readFileSync("/tmp/smtp-key.pem");
  const cert = fs.readFileSync("/tmp/smtp-cert.pem");
  let secured = false;
  const server = net.createServer((socket) => {
    let buffer = "";
    const reply = (line: string) => socket.write(`${line}\r\n`);
    const onPlain = (chunk: Buffer) => {
      buffer += chunk.toString("latin1");
      while (buffer.includes("\n")) {
        const cut = buffer.indexOf("\n");
        const line = buffer.slice(0, cut).replace(/\r$/, "");
        buffer = buffer.slice(cut + 1);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) reply("250-localhost\r\n250 STARTTLS");
        else if (upper === "STARTTLS") {
          reply("220 ready");
          socket.off("data", onPlain);
          const secure = new tls.TLSSocket(socket, { isServer: true, key, cert });
          secured = true;
          let secureBuffer = buffer;
          buffer = "";
          let dataMode = false;
          let body = "";
          const writeSecure = (text: string) => secure.write(`${text}\r\n`);
          const take = (chunkIn: Buffer) => {
            secureBuffer += chunkIn.toString("latin1");
            if (dataMode) {
              body += secureBuffer;
              secureBuffer = "";
              if (body.includes("\r\n.\r\n")) {
                dataMode = false;
                writeSecure("250 queued");
              }
              return;
            }
            while (secureBuffer.includes("\n")) {
              const cut = secureBuffer.indexOf("\n");
              const command = secureBuffer.slice(0, cut).replace(/\r$/, "");
              secureBuffer = secureBuffer.slice(cut + 1);
              const name = command.toUpperCase();
              if (name.startsWith("EHLO")) writeSecure("250 AUTH LOGIN");
              else if (name.startsWith("MAIL FROM")) writeSecure("250 ok");
              else if (name.startsWith("RCPT TO")) writeSecure("250 ok");
              else if (name === "DATA") {
                writeSecure("354 start");
                dataMode = true;
              } else if (name === "QUIT") {
                writeSecure("221 bye");
                secure.end();
              } else writeSecure("250 ok");
            }
          };
          secure.on("data", take);
        } else reply("250 ok");
      }
    };
    reply("220 localhost ESMTP");
    socket.on("data", onPlain);
  });
  const port = await listen(server);
  const original = tls.connect;
  tls.connect = ((options: tls.ConnectionOptions, callback?: () => void) => original({ ...options, rejectUnauthorized: false }, callback)) as typeof tls.connect;
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port,
      user: "",
      pass: "",
      secure: false,
      from: "hello@sauticall.com",
      to: ["person@example.com"],
      subject: "Confirm",
      text: "code 111222",
      messageId: "sc-tls@sauticall.com",
    });
    assert.equal(result.ok, true, result.message);
    assert.equal(secured, true);
  } finally {
    tls.connect = original;
    server.close();
  }
});
