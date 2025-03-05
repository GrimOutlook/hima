import React from 'react';

type TotalHoursCardProps = {
    className?: string;
    hours: number
}

const TotalHoursCard: React.FC<TotalHoursCardProps> = ({className, hours}) => {
    let color = "text-red-400";
    if (hours > 0) {
        color = "text-green-400"
    } else if (hours == 0) {
        color = "text-zinc-400"
    }
    
    return (
        <div className={`${className} bg-zinc-100 p-4 rounded-lg shadow-xs flex flex-col ${color}`}>
            {/* <!-- Hour --> */}
            <div className="text-8xl text-center font-black">{hours}</div>
            {/* <!-- Unit --> */}
            <div className="text-lg text-center font-bold">hours</div>
        </div>
    );
}

export default TotalHoursCard;