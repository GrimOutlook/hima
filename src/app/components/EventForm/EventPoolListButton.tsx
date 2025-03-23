import {
  selectEventFormData,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { GradientFocusInput } from "../GradientFocusInput";
import { ListboxButton } from "@headlessui/react";
import { selectPools } from "@/lib/features/poolListSlice";

type EventPoolListButtonProps = {
  showError: boolean;
  onBlur: () => void;
  onFocus: () => void;
};

export const EventPoolListButton: React.FC<EventPoolListButtonProps> = ({
  showError,
  onBlur,
  onFocus,
}) => {
  const eventFormData = useAppSelector(selectEventFormData);
  const pools = useAppSelector(selectPools);

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
      invalid={showError}
      className="w-30 h-10 mr-1 inline-block text-left relative"
      focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
      unfocusedClassName="bg-zinc-300"
    >
      <ListboxButton
        className={`${showError ? "border-red-500" : ""} rounded-lg
        bg-black/10`}
        onFocus={onFocus}
        onBlur={onBlur}
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
