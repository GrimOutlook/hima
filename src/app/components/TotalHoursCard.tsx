import { PPLPool, deserializeToPool } from "@/lib/models/PPLPool";
import React from "react";
import { calculateAmount } from "@/lib/logic";
import dayjs from "dayjs";
import { isEmpty } from "@/lib/helpers";
import { selectPools } from "@/lib/features/poolListSlice";
import { useAppSelector } from "@/lib/hooks";

type TotalHoursCardProps = {
  className?: string;
};

const TotalHoursCard: React.FC<TotalHoursCardProps> = ({ className }) => {
  const pools = useAppSelector(selectPools).map((pool) =>
    deserializeToPool(pool)
  );

  const calculateTotal = (poo: PPLPool[]) => {
    if (isEmpty(poo)) {
      return 0;
    }

    return poo
      .map((pool) => calculateAmount(dayjs(), pool, []))
      .reduce((acc, curr) => acc + curr);
  };

  let color = "text-red-400";
  const hours = calculateTotal(pools);
  if (hours > 0) {
    color = "text-green-400";
  } else if (hours === 0) {
    color = "text-zinc-400";
  }

  return (
    <div
      className={`${className} bg-zinc-100 p-2 rounded-lg shadow-xs flex flex-col grow ${color}`}
    >
      {/* <!-- Hour --> */}
      <div className="text-8xl text-center font-black">{hours}</div>
      {/* <!-- Unit --> */}
      <div className="text-lg text-center font-bold">hours</div>
    </div>
  );
};

export default TotalHoursCard;
