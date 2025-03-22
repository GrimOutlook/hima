import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { GradientFocusInput } from "../GradientFocusInput";
import { ListboxButton } from "@headlessui/react";
import React from "react";
import { selectPoolFormData } from "@/lib/features/poolFormSlice";
import { useAppSelector } from "@/lib/hooks";

type PoolPeriodListButtonProps = {
  showError: boolean;
  onBlur: () => void;
  onFocus: () => void;
};

export const PoolPeriodListButton: React.FC<PoolPeriodListButtonProps> = ({
  showError,
  onBlur,
  onFocus,
}) => {
  const poolFormData = useAppSelector(selectPoolFormData);

  return (
    <GradientFocusInput
      invalid={showError}
      className="w-30 h-10 mr-1 inline-block text-left relative"
      focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
      unfocusedClassName="bg-zinc-300"
    >
      <ListboxButton
        className={`${showError ? "border-red-500" : ""} rounded-lg bg-black/10`}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {poolFormData.period}
        <ChevronDownIcon
          className={`pointer-events-none absolute top-2.5 right-2.5 size-4
            fill-black/60`}
          aria-hidden="true"
        />
      </ListboxButton>
    </GradientFocusInput>
  );
};
