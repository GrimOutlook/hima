export const enumToArray = (_enum: object) => Object.values(_enum);

export const toTitleCase = (str: string) =>
  str
    .toLowerCase()
    .split(" ")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const isEmpty = <T>(arr: T[]) => arr.length === 0;

export const getNextId = (usedIds: number[]) => {
  while (true) {
    const nextId = randomInt(0, 2 ** 48 - 1);
    if (nextId !== 0 && !usedIds.some((id) => id === nextId)) {
      return nextId;
    }
  }
};

export enum DayOfWeek {
  Sunday = 0,
  Monday,
  Tuesday,
  Wednesday,
  Thursday,
  Friday,
  Saturday = 6
}
