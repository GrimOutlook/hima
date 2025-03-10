import { openAlertDialog } from "@/lib/features/alertDialogSlice";
import { openEventDialog } from "@/lib/features/eventDialogSlice";
import { deserializeToPool } from "@/lib/models/PPLPool";
import { selectPools } from "@/lib/features/poolListSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";

export const EventListTopBar = () => {
  const dispatch = useAppDispatch();
  const pools = useAppSelector(selectPools).map((pool) =>
    deserializeToPool(pool)
  );

  const openEventForm = () => {
    // eslint-disable-next-line no-magic-numbers
    if (isEmpty(pools)) {
      dispatch(
        openAlertDialog({
          message: "You must create a pool before you can create an event.",
          timeout: 3,
          title: "No pools available",
        })
      );
      return;
    }
    dispatch(openEventDialog());
  };

  return (
    <>
      {/* <!-- Events list top bar --> */}
      <div className="grid grid-cols-3 w-full h-18">
        {/* <!-- Empty div for grid spacing --> */}
        <div></div>
        {/* <!-- Event list title --> */}
        <div
          className={`text-4xl text-center self-center justify-self-center m-2
        dark:text-zinc-200`}
        >
          Events
        </div>
        {/* <!-- Add event button --> */}
        <svg
          className={`h-12 w-auto self-center justify-self-end m-4 fill-zinc-500
        hover:fill-zinc-900 hover:drop-shadow-lg transition duration-150
          ease-in-out hover:-translate-y-1 hover:scale-110 cursor-pointer`}
          viewBox="0 0 24 24"
          onClick={() => openEventForm()}
        ></svg>
      </div>
    </>
  );
};
