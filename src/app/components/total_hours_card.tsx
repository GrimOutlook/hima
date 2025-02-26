export default function TotalHoursCard() {
    return (
        <div className="bg-zinc-100 h-48 rounded-sm mb-2 shadow-sm flex flex-col ">
            {/* Make a color gradient for the hours text */}
            <div className="text-transparent bg-clip-text bg-gradient-to-tr from-sky-300 to-red-400">
                {/* <!-- Hour --> */}
                <div className="text-8xl text-center">26</div>
                {/* <!-- Unit --> */}
                <div className="text-lg text-center">hours</div>
            </div>
        </div>
    );
}