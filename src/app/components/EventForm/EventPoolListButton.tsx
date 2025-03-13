import {
  selectEventFormData,
  selectEventFormErrors,
  setEventFormErrors,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { EventFormErrors } from "./EventFormErrors";
import { GradientFocusInput } from "../GradientFocusInput";
import { ListboxButton } from "@headlessui/react";
import { selectPools } from "@/lib/features/poolListSlice";

const FIELD = EventFormErrors.POOL;

export const EventPoolListButton = () => {
  const dispatch = useAppDispatch();
  const eventFormData = useAppSelector(selectEventFormData);
  const errors = useAppSelector(selectEventFormErrors);
  const pools = useAppSelector(selectPools);

  // eslint-disable-next-line no-bitwise
  const isInvalid = (errors & FIELD) > 0;
  const selectedPoolName = () => {
    if (pools.length <= 0) {
      return "";
    }
    const pool = pools.find((poo) => poo.id === eventFormData.poolId);

    if (pool) {
      return pool.name;
    }
    return "";
  };

  return (
    <GradientFocusInput
      invalid={isInvalid}
      className="w-30 h-10 mr-1 inline-block text-left relative"
      focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
      unfocusedClassName="bg-zinc-300"
    >
      <ListboxButton
        className={`${isInvalid ? "border-red-500" : ""} rounded-lg bg-black/10`}
        onClick={() =>
          // eslint-disable-next-line no-bitwise
          dispatch(setEventFormErrors(errors & ~FIELD))
        }
      >
        {selectedPoolName()}
        <ChevronDownIcon
          className={`pointer-events-none absolute top-2.5 right-2.5 size-4
            fill-black/60`}
          aria-hidden="true"
        />
      </ListboxButton>
    </GradientFocusInput>
  );
};
