export function EnumToArray(e: object) {
    return Object.values(e)
}

export function ToTitleCase(str: String) {
    return str.toLowerCase().split(' ').map((word: any) => {
        return (word.charAt(0).toUpperCase() + word.slice(1));
    }).join(' ');
}

export const randomInt = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;