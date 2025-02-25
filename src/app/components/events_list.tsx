export default function EventsList() {
    return (
        <div className="flex flex-col min-w-48 w-2/3 bg-zinc-100 rounded-sm m-2 shadow-sm">
            {/* <!-- Events list top bar --> */}
            <div className="grid grid-cols-3 w-full h-18">
                {/* <!-- Empty div for grid spacing --> */}
                <div></div>
                {/* <!-- Event list title --> */}
                <div className="text-4xl text-center self-center justify-self-center m-2">Events</div>
                {/* <!-- Add event button --> */}
                <svg className="h-1/2 w-auto self-center justify-self-end m-4 fill-zinc-500 hover:fill-zinc-900" viewBox="0 0 24 24">
                    <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clip-rule="evenodd" />
                </svg>
            </div>
            {/* <!-- Event list --> */}
            <div className="m-2">
                {/* <!-- First event --> */}
                <div className="flex flex-row bg-red-100 m-2 rounded-sm h-18 transition
                duration-150 ease-in-out hover:-translate-y-1 hover:scale-102">
                    {/* <!-- Hours --> */}
                    <div className="flex flex-col justify-center items-center h-full w-24 p-2">
                        <div className="text-4xl h-2/3 w-full text-center overflow-hidden text-ellipsis">
                            8
                        </div>
                        <div className="text-sm h-1/3 w-full text-center">hrs</div>
                    </div>
                    <div className="flex flex-col w-full m-2">
                        {/* <!-- Description of event --> */}
                        <div className="text-xl h-full w-full overflow-hidden text-ellipsis">Taking
                        a floating holiday for fun</div>
                        {/* <!-- Pool name --> */}
                        <div className="text-m h-full w-full">Pool: Floating</div>
                    </div>
                </div>
                {/* <!-- Second event --> */}
                <div className="flex flex-row bg-blue-100 m-2 rounded-sm h-18 transition
                duration-150 ease-in-out hover:-translate-y-1 hover:scale-102">
                    {/* <!-- Hours --> */}
                    <div className="flex flex-col justify-center items-center h-full w-24 p-2">
                        <div className="text-4xl h-2/3 w-full text-center overflow-hidden text-ellipsis">
                            4
                        </div>
                        <div className="text-sm h-1/3 w-full text-center">hrs</div>
                    </div>
                    <div className="flex flex-col w-full m-2">
                        {/* <!-- Description of event --> */}
                        <div className="text-xl h-full w-full overflow-hidden text-ellipsis">Doing
                        something, somewhere, at sometime</div>
                        {/* <!-- Pool name --> */}
                        <div className="text-m h-full w-full">Pool: PPL</div>
                    </div>
                </div>
            </div>
        </div>
    );
}