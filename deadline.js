// Deadline detection + natural-date parser (India style: day before month, e.g. 28/10).
(function (g) {
  const MONTHS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
    jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const DAYS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const DAY = "(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues|thurs|thur|mon|tue|wed|thu|fri|sat|sun)";

  const hasKeyword = (t) => /\bdeadlines?\b/i.test(t);
  const valid = (y, m, d) => { const x = new Date(y, m, d); return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d; };
  const fullYear = (y) => (y < 100 ? 2000 + y : y);

  function parse(text, now = new Date()) {
    let t = " " + String(text).toLowerCase().replace(/[,]/g, " ") + " ";
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ---- time ----
    let hh = null, mm = 0, m;
    if ((m = t.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)/))) {
      hh = +m[1]; mm = +m[2]; const pm = m[3][0] === "p";
      if (hh === 12) hh = pm ? 12 : 0; else if (pm) hh += 12;
      t = t.replace(m[0], " ");
    } else if ((m = t.match(/\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/))) {
      hh = +m[1]; const pm = m[2][0] === "p";
      if (hh === 12) hh = pm ? 12 : 0; else if (pm) hh += 12;
      t = t.replace(m[0], " ");
    } else if ((m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))) {
      hh = +m[1]; mm = +m[2];
      t = t.replace(m[0], " ");
    } else if (/\bnoon\b/.test(t)) hh = 12;
    else if (/\bmidnight\b/.test(t)) { hh = 23; mm = 59; }
    else if (/\b(eod|end of (the )?day|cob|close of business)\b/.test(t)) hh = 18;
    if (hh !== null && (hh > 23 || mm > 59)) hh = null;

    // ---- date ----
    let date = null, explicitYear = false;
    const addDays = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
    if (/\bday after tomorrow\b/.test(t)) date = addDays(2);
    else if (/\b(tomorrow|tmrw|tmr|tom)\b/.test(t)) date = addDays(1);
    else if (/\b(today|tonight)\b/.test(t)) date = addDays(0);
    else if ((m = t.match(/\bin (\d{1,3}) days?\b/))) date = addDays(+m[1]);
    else if ((m = t.match(/\bin (\d{1,2}) weeks?\b/))) date = addDays(7 * +m[1]);
    else if ((m = t.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-]*(?:of\\s+)?" + MON + "\\b(?:\\s+(\\d{4}|\\d{2})\\b)?")))) {
      const mo = MONTHS[m[2]], d = +m[1]; let y = today.getFullYear();
      if (m[3]) { y = fullYear(+m[3]); explicitYear = true; }
      if (valid(y, mo, d)) date = new Date(y, mo, d);
    } else if ((m = t.match(new RegExp("\\b" + MON + "\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s+(\\d{4}))?")))) {
      const mo = MONTHS[m[1]], d = +m[2]; let y = today.getFullYear();
      if (m[3]) { y = +m[3]; explicitYear = true; }
      if (valid(y, mo, d)) date = new Date(y, mo, d);
    } else if ((m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{4}|\d{2}))?\b/))) {
      const d = +m[1], mo = +m[2] - 1; let y = today.getFullYear();
      if (m[3]) { y = fullYear(+m[3]); explicitYear = true; }
      if (valid(y, mo, d)) date = new Date(y, mo, d);
    } else if ((m = t.match(new RegExp("\\b(?:(next|this|coming)\\s+)?" + DAY + "\\b")))) {
      const want = DAYS[m[2]]; let diff = (want - today.getDay() + 7) % 7;
      if (m[1] === "next" && diff === 0) diff = 7;
      else if (!m[1] && diff === 0) diff = 7;
      else if (m[1] === "next" && diff < 7 && want <= today.getDay()) diff += 0;
      date = addDays(diff);
    }
    if (date && !explicitYear && date < today && !/\b(today|tonight|tomorrow|tmrw|tmr)\b/.test(t)) {
      date = new Date(date.getFullYear() + 1, date.getMonth(), date.getDate());
    }

    // ---- combine ----
    const assumed = !date && hh === null;
    let h = hh === null ? 23 : hh, mi = hh === null ? 55 : mm; // no time given -> 11:55 PM
    let day = date;
    if (!day) {
      day = today;
      if (new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi) <= now) {
        day = hh === null ? today : addDays(1); // time given but passed -> tomorrow
      }
    }
    let due = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi);
    return { due: due.getTime(), hasDate: !!date, hasTime: hh !== null, assumed };
  }

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  const clean = (text) => String(text).replace(/\s+/g, " ").trim().slice(0, 140);
  const makeItem = (text, now = new Date()) => {
    const p = parse(text, now);
    const t = clean(text);
    return { id: "dl" + hash(t.toLowerCase() + "|" + p.due), text: t, due: p.due, done: false, created: Date.now(), assumed: p.assumed };
  };
  const label = (due, now = new Date()) => {
    const d = new Date(due), n = new Date(now);
    const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((dayStart(d) - dayStart(n)) / 86400000);
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const when = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday"
      : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    return `${when}, ${time}`;
  };

  g.JDeadline = { hasKeyword, parse, makeItem, label, hash };
})(typeof self !== "undefined" ? self : window);
