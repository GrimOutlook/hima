import {describe, expect, test} from '@jest/globals';

import dayjs from 'dayjs';
import { elapsedPeriods } from '../../src/lib/logic';
import { Period } from '../../src/lib/models/Period';

describe('Testing elapsedPeriods() - daily', () => {
  const period = Period.Daily
  test('0 days result is 0', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0), period)).toBe(0);
  });
  test('1 day result is 1', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(1, 'day'), period)).toBe(1);
  });
  test('7 days result is 7', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(7, 'day'), period)).toBe(7);
  });
});

describe('Testing elapsedPeriods() - weekly', () => {
  const period = Period.Weekly
  test('0 week result is 0', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0), period)).toBe(0);
  });
  test('1 week result is 1', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(1, 'week'), period)).toBe(1);
  });
  test('7 week result is 7', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(7, 'week'), period)).toBe(7);
  });
});

describe('Testing elapsedPeriods() - biweekly', () => {
  const period = Period.BiWeekly
  test('0 week result is 0', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0), period)).toBe(0);
  });
  test('1 week result is 0', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(1, 'week'), period)).toBe(0);
  });
  test('2 week result is 1', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(2, 'week'), period)).toBe(1);
  });
  test('7 week result is 3', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(7, 'week'), period)).toBe(3);
  });
  test('8 week result is 4', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(8, 'week'), period)).toBe(4);
  });
});

describe('Testing elapsedPeriods() - monthly', () => {
  const period = Period.Monthly
  test('0 month result is 0', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0), period)).toBe(0);
  });
  test('1 week result is 0', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(1, 'week'), period)).toBe(0);
  });
  test('1 month result is 1', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(1, 'month'), period)).toBe(1);
  });
  test('12 months result is 12', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(12, 'month'), period)).toBe(12);
  });
});

describe('Testing elapsedPeriods() - yearly', () => {
  const period = Period.Yearly
  test('0 year result is 0', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0), period)).toBe(0);
  });
  test('1 month result is 0', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(1, 'week'), period)).toBe(0);
  });
  test('12 month result is 1', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(12, 'month'), period)).toBe(1);
  });
  test('38 month result is 3', () => {
    expect(elapsedPeriods(dayjs(0), dayjs(0).add(38, 'month'), period)).toBe(3);
  });
});