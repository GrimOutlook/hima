import { selectPools } from '@/lib/features/poolListSlice';
import { useAppSelector } from '@/lib/hooks';
import { calculateAmount } from '@/lib/logic';
import { DeserializeToPool, PPLPool } from '@/lib/models/PPLPool';
import dayjs from 'dayjs';
import React from 'react';

type TotalHoursCardProps = {
    className?: string;
}

const TotalHoursCard: React.FC<TotalHoursCardProps> = ({className}) => {
    const pools = useAppSelector(selectPools).map((pool) => DeserializeToPool(pool));

    const calculateTotal = (pools: PPLPool[]) => {
        if (pools.length <= 0) {
            return 0
        }

        return pools.map((pool) => calculateAmount(dayjs(), pool, [])).reduce((acc, curr) => acc + curr)
    }
    
    let color = "text-red-400";
    const hours = calculateTotal(pools);
    if (hours > 0) {
        color = "text-green-400"
    } else if (hours == 0) {
        color = "text-zinc-400"
    }
    
    return (
        <div className={`${className} bg-zinc-100 p-2 rounded-lg shadow-xs flex flex-col grow ${color}`}>
            {/* <!-- Hour --> */}
            <div className="text-8xl text-center font-black">{hours}</div>
            {/* <!-- Unit --> */}
            <div className="text-lg text-center font-bold">hours</div>
        </div>
    );
}

export default TotalHoursCard;