import React from 'react';

type TotalHoursCardProps = {
    className?: string;
}

const TotalHoursCard: React.FC<TotalHoursCardProps> = ({className}) => {
    return (
        <div className={`${className} bg-zinc-100 h-auto p-4 rounded-lg shadow-sm flex flex-col`}>
            {/* <!-- Hour --> */}
            <div className="text-8xl text-center font-black text-red-400 text-blue-300">26</div>
            {/* <!-- Unit --> */}
            <div className="text-lg text-center font-bold">hours</div>
        </div>
    );
}

export default TotalHoursCard;