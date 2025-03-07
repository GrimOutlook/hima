import React from "react"
import { useState } from "react"

interface GradientFocusChildProps {
    onFocus?: () => void;
    onBlur?: () => void;
    className?: string;
}

type GradientFocusInputProps = {
    children: React.ReactElement,
    className?: string,
    focusClassName?: string,
    unfocusedClassName?: string,
}

export const GradientFocusInput: React.FC<GradientFocusInputProps> = ({children, className, focusClassName, unfocusedClassName}) => {
    let [isFocused, setIsFocused] = useState(false)

    if (! React.isValidElement(children)) {
        console.error("Passed in child is invalid for GradientFocusInput")
    }

    const childProps = children.props as GradientFocusChildProps;
    
    let childOnFocus = () => {};
    if (childProps.onFocus) {
        childOnFocus = childProps.onFocus
    }
    let childOnBlur = () => {};
    if (childProps.onBlur) {
        childOnBlur = childProps.onBlur
    }
    let childClassName;
    if (childProps.className) {
        childClassName = childProps.className
    }

    let additionalProps = {
        onFocus: () => {childOnFocus; setIsFocused(true)},
        onBlur: () => {childOnBlur; setIsFocused(false)},
        className: `${childClassName} bg-black/10 rounded-md w-full h-full focus:outline-hidden p-2`
    };
    let updated_child = React.cloneElement(children, additionalProps)

    return (
        <div className={`${isFocused && `${focusClassName}` || "bg-black/10"} ${className} rounded-lg p-0.5`}>
            <div className={`${unfocusedClassName} w-full h-full rounded-md`}>
                {updated_child}
            </div>
        </div>
    )
}