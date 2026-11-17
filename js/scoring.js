/**
 * Turns the three rounds' raw numbers into a total score, a 0-100 rating for each
 * skill, and a tier. Pure functions, so the tests can check every rule.
 */

/**
 * Tiers from the bottom up. Tuned with tests/calibrate.mjs: a casual player lands in
 * Drizzle or Cirrus, a regular gamer in Cumulus, a strong one in Thunderhead, and only
 * pro-level aim reaches Cloud Nine.
 */
export const TIERS = [
  { name: "Drizzle", min: 0 },
  { name: "Cirrus", min: 3500 },
  { name: "Cumulus", min: 6500 },
  { name: "Thunderhead", min: 10500 },
  { name: "Cloud Nine", min: 18000 },
];

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function average(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/**
 * How fast an average reaction is, from 0 (900 ms or slower) to 1 (300 ms or faster).
 *
 * :param ms: the average reaction in milliseconds, or null when there were no hits
 * :return: 0 to 1
 */
export function speedScore(ms) {
  return ms === null ? 0 : clamp01((900 - ms) / 600);
}

/**
 * Aim, from the Flick round: hits per second, accuracy and speed.
 *
 * :param flick: FlickStage.result()
 * :return: 0 to 100
 */
export function aimRating(flick) {
  const shots = flick.hits + flick.misses;
  const rate = clamp01(flick.hits / flick.seconds / 1.6);
  const accuracy = shots ? flick.hits / shots : 0;
  const speed = speedScore(average(flick.reactions));
  return Math.round(100 * (0.5 * rate + 0.25 * accuracy + 0.25 * speed));
}

/**
 * Tracking, from the Track round: the share of the round spent on target.
 *
 * :param track: TrackStage.result()
 * :return: 0 to 100
 */
export function trackingRating(track) {
  return Math.round(100 * clamp01(track.onTarget / track.seconds));
}

/**
 * Decisions, from the Read round: right calls out of all calls, with a speed bonus.
 * A friendly left alone counts as a right call; a stray click counts as half a wrong one.
 *
 * :param read: ReadStage.result()
 * :return: 0 to 100
 */
export function decisionRating(read) {
  const right = read.correct + read.avoided;
  const calls = right + read.wrong + read.missed + read.stray * 0.5;
  if (!calls) return 0;
  const speed = speedScore(average(read.reactions));
  return Math.round(100 * (right / calls) * (0.7 + 0.3 * speed));
}

/**
 * :param total: a run's total points
 * :return: the tier's name
 */
export function tierFor(total) {
  let tier = TIERS[0].name;
  for (const step of TIERS) {
    if (total >= step.min) tier = step.name;
  }
  return tier;
}

/**
 * Score a whole run.
 *
 * :param flick: FlickStage.result()
 * :param track: TrackStage.result()
 * :param read: ReadStage.result()
 * :return: {total, aim, tracking, decisions, tier, reaction}
 */
export function scoreRun(flick, track, read) {
  const total = Math.round(flick.points + track.points + read.points);
  const reactions = flick.reactions.concat(read.reactions);
  const reaction = average(reactions);
  return {
    total: total,
    aim: aimRating(flick),
    tracking: trackingRating(track),
    decisions: decisionRating(read),
    tier: tierFor(total),
    reaction: reaction === null ? null : Math.round(reaction),
  };
}
