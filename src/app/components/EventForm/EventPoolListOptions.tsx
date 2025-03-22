import { ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { selectPools } from "@/lib/features/poolListSlice";
import { useAppSelector } from "@/lib/hooks";

export const EventPoolListOptions = () => {
  const pools = useAppSelector(selectPools);

  return (
    <ListboxOptions
      anchor="bottom"
      className={clsx(
        `w-[var(--button-width)] rounded-xl border border-black/10 
        bg-zinc-300/95 p-1 [--anchor-gap:var(--spacing-1)]
        focus:outline-hidden transition duration-100 ease-in
        data-leave:data-closed:opacity-0`
      )}
    >
      {pools.map((pool) => (
        <ListboxOption
          key={pool.id}
          value={pool.id}
          className={`group flex cursor-default items-center gap-2 rounded-lg
          py-1.5 px-3 select-none data-focus:bg-white/10`}
        >
          <CheckIcon
            className={
              "invisible size-6 fill-black group-data-selected:visible"
            }
          />
          {pool.name}
        </ListboxOption>
      ))}
    </ListboxOptions>
  );
};
