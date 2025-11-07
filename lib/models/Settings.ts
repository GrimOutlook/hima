import { DayOfWeek } from "@/lib/helpers"

export type Settings = {
  // The amount of hours to auto populate when making a leave event on a
  // workday.
  hoursWorkedPerDay: number;
  // Used to determine the maximum amount of leave hours to use per week
  hoursWorkedPerWeek: number;
  // `hoursWorkedPerDay` will be used to subtract from the given pool for every
  // day in event that matches a day in `workedDays` until `hoursWorkedPerWeek`
  // is hit.
  workedDays: DayOfWeek[]
};
