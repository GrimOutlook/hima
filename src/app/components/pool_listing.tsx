import React from 'react';

type PoolListingProps = {
    className?: string;
}

const PoolListing: React.FC<PoolListingProps> = ({className}) => {
    return (
        <div className="flex flex-row bg-blue-300 mt-2 mx-2 rounded-lg h-18 transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102 hover:drop-shadow-lg cursor-pointer">
            <div className="flex flex-col w-full">
                {/* <!-- Name --> */}
                <div className="text-2xl h-full w-full p-2 line-clamp-1 font-bold">PPL</div>
                {/* <!-- Hours --> */}
                <div className="text-xl h-full w-full pl-2">
                    10
                    <span className="text-sm">hrs</span>
                </div>
            </div>
        </div>
    );
}

export default PoolListing;