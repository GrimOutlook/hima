export const EnumToArray = (enu: object) => Object.values(enu);

export const ToTitleCase = (str: string) =>
  str
    .toLowerCase()
    .split(" ")
    // eslint-disable-next-line no-magic-numbers
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const randomInt = (min: number, max: number) =>
  // eslint-disable-next-line no-magic-numbers
  Math.floor(Math.random() * (max - min + 1)) + min;

// eslint-disable-next-line no-magic-numbers
export const isEmpty = <T>(arr: T[]) => arr.length === 0;
