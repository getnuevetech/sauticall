export function confirmationMail(input: { name: string; code: string; link: string }) {
  const code = input.code.trim();
  return {
    subject: `Your SautiCall code is ${code}`,
    text: `Your SautiCall code is ${code}.\n\nHi ${input.name},\n\nEnter that code to confirm your email, or open this link:\n${input.link}\n\nThe code and link expire in 30 minutes. If you ask for another email, use the newest code.`,
  };
}
