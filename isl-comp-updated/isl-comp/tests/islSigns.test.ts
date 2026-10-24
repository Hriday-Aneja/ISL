import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ISL_CATEGORIES,
  ISL_SIGNS,
  ISL_VIDEO_COUNT,
  getSignById,
  glossToSignId,
  searchSigns,
  signsInText,
} from '../src/data/islSigns';
import { AVATAR_VIDEOS } from '../src/data/avatarVideos';

const csvRows = readFileSync(resolve('src/data/isl_signs_catalog.csv'), 'utf8')
  .replace(/^﻿/, '')
  .split(/\r?\n/)
  .filter(Boolean)
  .slice(1);

test('catalog contains exactly the signs in the CSV', () => {
  assert.equal(csvRows.length, 248);
  assert.equal(ISL_SIGNS.length, csvRows.length);
  const glosses = new Set(ISL_SIGNS.map((s) => s.gloss));
  for (const row of csvRows) {
    const gloss = row.split('","')[1].replace(/"$/, '');
    assert.ok(glosses.has(gloss), `missing ${gloss}`);
  }
});

test('ids are unique and 15 categories are kept in CSV order', () => {
  assert.equal(new Set(ISL_SIGNS.map((s) => s.id)).size, ISL_SIGNS.length);
  assert.equal(ISL_CATEGORIES.length, 15);
  assert.equal(ISL_CATEGORIES[0].category, 'Adjectives');
  assert.equal(ISL_CATEGORIES.reduce((n, c) => n + c.count, 0), ISL_SIGNS.length);
});

test('a sign only has video if the file really exists in public/', () => {
  const withVideo = ISL_SIGNS.filter((s) => s.videoSrc);
  assert.equal(withVideo.length, ISL_VIDEO_COUNT);
  for (const sign of withVideo) {
    assert.ok(existsSync(resolve('public', sign.videoSrc!.replace(/^\//, ''))), `${sign.label}: ${sign.videoSrc} missing`);
  }
  // Every shipped clip that the catalog knows about is wired up…
  const wired = new Set(withVideo.map((s) => s.videoSrc));
  const catalogIds = new Set(ISL_SIGNS.map((s) => glossToSignId(s.gloss)));
  for (const [id, src] of Object.entries(AVATAR_VIDEOS)) {
    if (catalogIds.has(id)) assert.ok(wired.has(src), `${id} clip not linked`);
  }
});

test('known video and no-video signs', () => {
  assert.ok(getSignById('doctor')?.videoSrc);
  assert.ok(getSignById('train-station')?.videoSrc);
  assert.equal(getSignById('hello')?.videoSrc, '/avatar-videos/hello.mp4');
  // In the CSV, but no recording shipped: must be reported as unavailable.
  assert.equal(getSignById('thank-you')?.videoSrc, undefined);
  assert.equal(getSignById('water')?.videoSrc, undefined);
  assert.equal(getSignById('does-not-exist'), undefined);
});

test('search by gloss, synonym, category, with filters', () => {
  assert.ok(searchSigns({ query: 'doctor' }).some((s) => s.id === 'doctor'));
  assert.ok(searchSigns({ query: 'large' }).some((s) => s.id === 'big-large'));
  assert.ok(searchSigns({ query: 'little' }).some((s) => s.id === 'small-little'));
  assert.ok(searchSigns({ query: 'greetings' }).every((s) => s.category === 'Greetings'));
  assert.equal(searchSigns({ query: 'zzzzqq' }).length, 0);
  assert.equal(searchSigns({ onlyWithVideo: true }).length, ISL_VIDEO_COUNT);
  assert.deepEqual(searchSigns({ onlyIds: new Set(['doctor']) }).map((s) => s.id), ['doctor']);
  assert.equal(searchSigns({ category: 'Animals' }).length, 8);
});

test('signsInText is a word lookup: finds glosses, phrases and plurals, nothing more', () => {
  const ids = (t: string) => signsInText(t).map((s) => s.id);
  assert.deepEqual(ids('Where is the doctor?'), ['doctor']);
  assert.deepEqual(ids('doctors'), ['doctor']);
  assert.ok(ids('Thank you very much').includes('thank-you'));
  assert.ok(ids('Good morning, how are you').includes('good-morning'));
  assert.ok(ids('Good morning, how are you').includes('how-are-you'));
  assert.deepEqual(ids('xyzzy plugh'), []);
  assert.deepEqual(ids(''), []);
  assert.equal(new Set(ids('doctor doctor doctor')).size, 1);
});
