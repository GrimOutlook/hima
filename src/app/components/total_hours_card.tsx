import React from 'react';

type TotalHoursCardProps = {
    className?: string;
}

const TotalHoursCard: React.FC<TotalHoursCardProps> = ({className}) => {
    return (
        <div className={`${className} bg-zinc-100 h-auto p-4 rounded-lg shadow-sm flex flex-col`}>
            {/* Make a color gradient for the hours text */}
            <div className="text-transparent self-center bg-clip-text bg-gradient-to-tr from-sky-300 to-red-400">
                {/* <!-- Hour --> */}
                <div className="text-8xl text-center font-black">26</div>
                {/* <!-- Unit --> */}
                <div className="text-lg text-center font-bold">hours</div>
            </div>
        </div>
    );
}

export default TotalHoursCard;