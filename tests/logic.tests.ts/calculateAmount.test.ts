
import { calculateAmount } from '../../src/lib/logic';
import Period from '../../src/lib/models/Period';
import { PPLPool } from '../../src/lib/models/PPLPool';
import {describe, expect, test} from '@jest/globals';

import dayjs from 'dayjs';


describe('Testing calculateAmount()', () => {
  let period = Period.Daily
  test('case 1', () => {
    let amount = 8
    let days = 7;
    let start_date = dayjs(0)
    let target_date = start_date.add(days, 'days')
    let pool: PPLPool = {
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