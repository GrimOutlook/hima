
import { calculateAmount } from '../../src/lib/logic';
import { Period } from '../../src/lib/models/Period';
import { PPLPool } from '../../src/lib/models/PPLPool';
import {describe, expect, test} from '@jest/globals';

import dayjs from 'dayjs';


describe('Testing calculateAmount()', () => {
  test('case 1', () => {
    const amount = 8
    const days = 7;
    const start_date = dayjs(0)
    const target_date = start_date.add(days, 'days')
    const pool: PPLPool = {
        id: 0,
        name: '',
        description: '',
        amount,
        period: Period.Daily,
        startDate: start_date,
        startAmount: 0
    }
    expect(calculateAmount(target_date, pool, [])).toBe(days*amount);
  });
});