import React, { useState } from "react";
import styles from "@/styles/gradient_focus_input.module.css";

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
};

export const GradientFocusInput: React.FC<GradientFocusInputProps> = ({
  children,
  invalid,
  className,
  focusClassName,
  unfocusedClassName,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const childProps = children.props as GradientFocusChildProps;
  const invalidClasses =
    (invalid && `${styles.shake} border-2 border-red-400`) || "";
  const propsAdd = {
    className: `${childProps.className} bg-black/10 rounded-md w-full h-full focus:outline-hidden p-2`,
    onBlur: () => {
      if (childProps.onBlur) {
        childProps.onBlur();
      }
      setIsFocused(false);
    },
    onFocus: () => {
      if (childProps.onFocus) {
        childProps.onFocus();
      }
      setIsFocused(true);
    },
  };
  const updateChild = React.cloneElement(children, propsAdd);

  return (
    <div
      className={`${(isFocused && !invalid && focusClassName) || "bg-black/10"} ${className} ${invalidClasses} rounded-lg p-0.5`}
    >
      <div className={`${unfocusedClassName} w-full h-full rounded-md`}>
        {updateChild}
      </div>
    </div>
  );
};
