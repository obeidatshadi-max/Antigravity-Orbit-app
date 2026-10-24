/* Report calculations contain no AI calls and never invent missing measurements. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const isAudit = row => row?.dominant_domain === 'Audit' || /^\[AUDIT/.test(row?.transcript || '');
  function scoreAnswers(questions, answers) {
    if (!questions.length || questions.length !== answers.length) return null;
    const domains = {};
    questions.forEach((q, i) => {
      const answer = answers[i];
      if (!Number.isInteger(answer) || answer < 0 || answer > 3) throw new Error('Invalid answer');
      (domains[q.domain] ||= []).push(answer / 3 * 100);
    });
    const scores = Object.fromEntries(Object.entries(domains).map(([k, values]) => [k, values.reduce((a,b)=>a+b,0)/values.length]));
    return {score: Object.values(scores).reduce((a,b)=>a+b,0)/Object.keys(scores).length, domains: scores};
  }
  function period(items, start, end) {
    return items.filter(item => {const t = Date.parse(item.created_at); return Number.isFinite(t) && t >= start && t < end;});
  }
  function counts(items, key) {
    const result = {};
    for (const item of items) if (item[key]) result[item[key]] = (result[item[key]] || 0) + 1;
    return Object.entries(result).sort((a,b)=>b[1]-a[1]);
  }
  function weekly(moments, now = Date.now()) {
    const current = period(moments, now-7*DAY, now+1);
    const previous = period(moments, now-14*DAY, now-7*DAY);
    const modes = counts(current, 'persona');
    return {current, previous, modes, emotions: counts(current, 'emotion'), domains: counts(current, 'domain'), top: modes[0] || null};
  }
  function comparableChange(records) {
    const valid = records.filter(r => r.version === 'orbit-checkin-v1' && Number.isFinite(r.score) && Number.isFinite(Date.parse(r.created_at)))
      .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
    if (valid.length < 2) return null;
    return {latest: valid[0], previous: valid[1], difference: valid[0].score-valid[1].score};
  }
  const api = {isAudit, scoreAnswers, weekly, comparableChange};
  root.OrbitCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
