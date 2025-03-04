import React from 'react';

type TotalHoursCardProps = {
    className?: string;
    hours: number
}

const TotalHoursCard: React.FC<TotalHoursCardProps> = ({className, hours}) => {
    let color = "text-red-400";
    if (hours >= 0) {
        color = "text-green-400"
    }
    
    return (
        <div className={`${className} bg-zinc-100 h-auto p-4 rounded-lg shadow-sm flex flex-col ${color}`}>
            {/* <!-- Hour --> */}
            <div className="text-8xl text-center font-black">26</div>
            {/* <!-- Unit --> */}
            <div className="text-lg text-center font-bold">hours</div>
        </div>
    );
}

export default TotalHoursCard;