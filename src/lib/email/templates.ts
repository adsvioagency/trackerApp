/** Plain-English email templates with Adsvio branding (inline styles for mail clients). */

const brand = {
  paper: "#FCFAF6",
  ink: "#16130F",
  inkSoft: "#5C554C",
  rule: "#E2DAD0",
  mango: "#E8590C",
  mangoDeep: "#C4470A",
};

function shell(title: string, bodyHtml: string, appUrl: string) {
  return `<!doctype html><html><body style="margin:0;background:${brand.paper};font-family:Inter,Segoe UI,Arial,sans-serif;color:${brand.ink}">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="font-weight:800;font-size:22px;letter-spacing:-0.03em;margin-bottom:20px">Adsvio<span style="color:${brand.mango}">.</span> <span style="font-weight:500;font-size:13px;color:${brand.inkSoft};margin-left:6px">Personal Assistant System</span></div>
  <div style="background:#fff;border:1px solid ${brand.rule};border-radius:14px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 12px;letter-spacing:-0.02em">${title}</h1>
    ${bodyHtml}
  </div>
  <p style="font-size:12px;color:${brand.inkSoft};margin-top:16px">Sent by your private assistant at <a href="${appUrl}" style="color:${brand.mangoDeep}">${appUrl}</a>. If you did not expect this email, you can ignore it.</p>
</div></body></html>`;
}

export function signInEmail(p: { code: string; minutes: number; appUrl: string }) {
  const subject = `${p.code} is your sign-in code`;
  const text = `Your sign-in code is ${p.code}. It expires in ${p.minutes} minutes.\n\nIf you did not request this code, ignore this email.`;
  const html = shell(
    "Your sign-in code",
    `<p style="margin:0 0 16px;color:${brand.inkSoft}">Enter this code to sign in. It expires in ${p.minutes} minutes.</p>
     <div style="font-size:34px;font-weight:800;letter-spacing:0.18em;font-variant-numeric:tabular-nums;background:${brand.paper};border:1px solid ${brand.rule};border-radius:10px;padding:16px;text-align:center">${p.code}</div>`,
    p.appUrl,
  );
  return { subject, text, html };
}

export type DigestItem = { title: string; detail: string; href: string; group: string };

export function digestEmail(p: { items: DigestItem[]; dateLabel: string; appUrl: string; isTest?: boolean }) {
  const subject = `${p.isTest ? "[Test] " : ""}${p.items.length} item${p.items.length === 1 ? "" : "s"} need attention · ${p.dateLabel}`;
  const groups = new Map<string, DigestItem[]>();
  for (const it of p.items) groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
  const textLines: string[] = [];
  const htmlParts: string[] = [];
  for (const [group, items] of groups) {
    textLines.push(`${group.toUpperCase()}`);
    htmlParts.push(`<h2 style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${brand.mangoDeep};margin:18px 0 8px">${group}</h2>`);
    for (const it of items) {
      textLines.push(`- ${it.title} — ${it.detail}\n  ${p.appUrl}${it.href}`);
      htmlParts.push(
        `<div style="padding:10px 0;border-top:1px solid ${brand.rule}"><a href="${p.appUrl}${it.href}" style="color:${brand.ink};font-weight:600;text-decoration:none">${it.title}</a><div style="color:${brand.inkSoft};font-size:13px">${it.detail}</div></div>`,
      );
    }
    textLines.push("");
  }
  const text = `${p.isTest ? "This is a test reminder. " : ""}Items that need your attention as of ${p.dateLabel}:\n\n${textLines.join("\n")}\nOpen Today: ${p.appUrl}/today\n\nReminders repeat about every 24 hours until each item is done, paid, dismissed or snoozed. Manage them in Settings → Reminders.`;
  const html = shell(
    p.isTest ? "Test reminder" : "Items that need your attention",
    `${p.isTest ? `<p style="background:#FDEDE2;color:${brand.mangoDeep};padding:8px 12px;border-radius:8px;font-size:13px;margin:0 0 12px">This is a visibly labeled test. Nothing was marked as sent for real reminders.</p>` : ""}
     <p style="margin:0;color:${brand.inkSoft}">As of ${p.dateLabel}.</p>${htmlParts.join("")}
     <p style="margin:20px 0 0"><a href="${p.appUrl}/today" style="display:inline-block;background:${brand.mangoDeep};color:#fff;font-weight:600;padding:10px 16px;border-radius:10px;text-decoration:none">Open Today</a></p>
     <p style="font-size:12px;color:${brand.inkSoft};margin:16px 0 0">Reminders repeat about every 24 hours until each item is done, paid, dismissed or snoozed. Manage them in Settings → Reminders.</p>`,
    p.appUrl,
  );
  return { subject, text, html };
}
