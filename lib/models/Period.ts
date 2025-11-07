import { enumToArray, toTitleCase } from "../helpers";

export enum Period {
  Daily = "Daily",
  Weekly = "Weekly",
  BiWeekly = "BiWeekly",
  Monthly = "Monthly",
  Yearly = "Yearly",
}

export const periods = enumToArray(Period).map((str: string) =>
  toTitleCase(str)
);

export const deserializeToPeriod = (period: string) => {
  switch (period.toUpperCase()) {
    case "DAILY":
      return Period.Daily;
    case "WEEKLY":
      return Period.Weekly;
    case "BIWEEKLY":
      return Period.BiWeekly;
    case "MONTHLY":
      return Period.Monthly;
    case "YEARLY":
      return Period.Yearly;
    default:
      // TODO: Add remote for when this fails
      console.error(
        `Error deserializing period ${period}. Defaulting to daily.`
      );
      return Period.Daily;
  }
};
