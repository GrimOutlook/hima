import { ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon } from "@heroicons/react/24/outline";
import React from "react";
import clsx from "clsx";
import { periods } from "@/lib/models/Period";

type PoolPeriodListOptionsProps = {
  onFocus: () => void;
};

export const PoolPeriodListOptions: React.FC<PoolPeriodListOptionsProps> = ({
  onFocus,
}) => (
  <ListboxOptions
    anchor="bottom"
    className={clsx(
      `w-[var(--button-width)] rounded-xl border border-black/10
        bg-zinc-300/95 p-1 [--anchor-gap:var(--spacing-1)]
        focus:outline-hidden transition duration-100 ease-in
        data-leave:data-closed:opacity-0`
    )}
    onFocus={onFocus}
  >
    {periods.map((period) => (
      <ListboxOption
        key={period}
        value={period}
        className={`group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none
            data-focus:bg-white/10`}
      >
        <CheckIcon
          className={"invisible size-6 fill-black group-data-selected:visible"}
        />
        {period}
      </ListboxOption>
    ))}
  </ListboxOptions>
);
