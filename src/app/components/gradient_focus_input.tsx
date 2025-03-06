import { Input, InputProps } from "@headlessui/react"
import { useState } from "react"

type GradientFocusInputProps = {
    inputProps?: InputProps,
    className?: string,
    focusClassName?: string,
    unfocusedClassName?: string,
}

export const GradientInput: React.FC<GradientFocusInputProps> = ({inputProps, className, focusClassName, unfocusedClassName}) => {
    let [isFocused, setIsFocused] = useState(false)

    return (
        <div className={`${isFocused && `${focusClassName}` || "bg-black/10"} ${className} rounded-lg p-0.5`}>
            <div className={`${unfocusedClassName} w-full h-full rounded-md`}>
                <Input  {...inputProps} className={`bg-black/10 rounded-md w-full h-full focus:outline-hidden p-2`} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} />
            </div>
        </div>
    )
}