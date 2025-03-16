import {
  selectPoolFormData,
  selectPoolFormErrors,
  setPoolFormErrors,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { GradientFocusInput } from "../GradientFocusInput";
import { ListboxButton } from "@headlessui/react";
import { PoolFormErrors } from "./PoolFormErrors";

const FIELD = PoolFormErrors.PERIOD;

export const PoolPeriodListButton = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const errors = useAppSelector(selectPoolFormErrors);

  // eslint-disable-next-line no-bitwise
  const showError = (errors & FIELD) > 0;

  return (
    <GradientFocusInput
      invalid={showError}
      className="w-30 h-10 mr-1 inline-block text-left relative"
      focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
      unfocusedClassName="bg-zinc-300"
    >
      <ListboxButton
        className={`${showError ? "border-red-500" : ""} rounded-lg bg-black/10`}
        onFocus={() =>
          // eslint-disable-next-line no-bitwise
          dispatch(setPoolFormErrors(errors & ~FIELD))
        }
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
