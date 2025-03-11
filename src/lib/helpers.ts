export const enumToArray = (enu: object) => Object.values(enu);

export const toTitleCase = (str: string) =>
  str
    .toLowerCase()
    .split(" ")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const isEmpty = <T>(arr: T[]) => arr.length === 0;
