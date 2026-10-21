// Decides what to do with a `prediction` message from recognition_service.py.
// Only values the model really outputs are used: top-1 confidence and the top-k list (softmax probabilities).
// There is deliberately no temporal "stability" filter: the service returns one prediction per recorded clip,
// not a stream of per-frame outputs, so there is nothing to smooth over.

/**
 * @returns {{label, display, confidence, margin, secondLabel, autoAppend: boolean, reasons: string[], top: Array}}
 * autoAppend is true only when the sign is verified AND enabled AND passes the configured thresholds.
 * Everything else is still shown to the user as a suggestion they can add with one click.
 */
export function evaluatePrediction(prediction, settings, signs) {
  const top = Array.isArray(prediction.top) && prediction.top.length ? prediction.top : [{ label: prediction.label, confidence: prediction.confidence }];
  const best = top[0];
  const second = top[1];
  const confidence = Number(best.confidence);
  const margin = second ? confidence - Number(second.confidence) : confidence;
  const sign = signs[best.label] || { label: best.label, display: best.label, verified: false, enabled: false };
  const reasons = [];
  if (!sign.enabled) reasons.push('sign is not enabled');
  if (!sign.verified) reasons.push('sign is unverified');
  if (confidence < settings.confidenceThreshold) reasons.push(`confidence ${fmt(confidence)} < ${fmt(settings.confidenceThreshold)}`);
  if (margin < settings.minMargin) reasons.push(`margin ${fmt(margin)} < ${fmt(settings.minMargin)}`);
  const withDisplay = (t) => ({ label: t.label, confidence: Number(t.confidence), display: (signs[t.label] || {}).display || t.label, verified: Boolean((signs[t.label] || {}).verified) });
  return {
    label: best.label,
    display: sign.display,
    confidence,
    margin,
    secondLabel: second ? second.label : null,
    autoAppend: sign.enabled && sign.verified && reasons.length === 0,
    reasons,
    top: top.map(withDisplay),
  };
}

function fmt(n) { return Number(n).toFixed(2); }

/** Append a word to the editable text with single-space separation. */
export function appendWord(text, word) {
  const t = String(text || '');
  if (!word) return t;
  if (!t || /\s$/.test(t)) return t + word;
  return `${t} ${word}`;
}
