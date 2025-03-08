import React from "react"
import { useState } from "react"
import styles from './gradient_focus_input.module.css';

interface GradientFocusChildProps {
    onFocus?: () => void;
    onBlur?: () => void;
    className?: string;
}

type GradientFocusInputProps = {
    children: React.ReactElement;
    className?: string;
    focusClassName?: string;
    unfocusedClassName?: string;
    invalid?: boolean;
}

export const GradientFocusInput: React.FC<GradientFocusInputProps> = ({children, invalid, className, focusClassName, unfocusedClassName}) => {
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

    let invalid_classes = invalid ? `${styles.shake} border-2 border-red-400` : ""

    let additionalProps = {
        onFocus: () => {childOnFocus; setIsFocused(true)},
        onBlur: () => {childOnBlur; setIsFocused(false)},
        className: `${childClassName} bg-black/10 rounded-md w-full h-full focus:outline-hidden p-2`
    };
    let updated_child = React.cloneElement(children, additionalProps)

    return (
        <div className={`${isFocused && ! invalid ? focusClassName : "bg-black/10"} ${className} ${invalid_classes} rounded-lg p-0.5`}>
            <div className={`${unfocusedClassName} w-full h-full rounded-md`}>
                {updated_child}
            </div>
        </div>
    )
}