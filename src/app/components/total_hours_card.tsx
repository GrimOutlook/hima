import React from 'react';

type TotalHoursCardProps = {
    className?: string;
}

const TotalHoursCard: React.FC<TotalHoursCardProps> = ({className}) => {
    return (
        <div className={`${className} bg-zinc-100 h-auto p-4 rounded-lg shadow-sm flex flex-col text-red-400 text-green-400`}>
            {/* <!-- Hour --> */}
            <div className="text-8xl text-center font-black">26</div>
            {/* <!-- Unit --> */}
            <div className="text-lg text-center font-bold">hours</div>
        </div>
    );
}

export default TotalHoursCard;