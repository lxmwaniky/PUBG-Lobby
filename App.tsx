/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, ChangeEvent, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateCharacterImage, detectGender } from './services/geminiService';
import PolaroidCard from './components/PolaroidCard';
import { createAlbumPage } from './lib/albumUtils';
import Footer from './components/Footer';

const MALE_CHARACTERS = [
    'The Fool Set', 'Blood Raven X-Suit', 'Ghillie Suit', 'Golden Pharaoh X-Suit', 'Enraged Unicorn Set', 
    'Executioner Set', 'Lone Survivor Set', 'Tidal Embrace Set', 'White Rabbit Set', 'Black Cat Set', 'Ranger Set', 'PMC Uniform'
];

const FEMALE_CHARACTERS = [
    'Silvanus X-Suit', 'Valkyrie Set', 'Jester Set', 'Avalanche X-Suit', 'Medical Robe Set', 'Noble Lineage Set', 
    'Stray Rebellion Set', 'Forest Warrior Set', 'Cyber Enforcer Set', 'Maverick Set', 'Lady of Blood Set', 'Infectious Bugs Set'
];

const MAPS = ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Karakin', 'a deserted city', 'a weathered battlefield'];
const SCENARIOS = [
    'looting a rare airdrop crate', 'in a tense firefight', 'scouting from a high vantage point', 
    'driving a UAZ across a field', 'celebrating a "Winner Winner Chicken Dinner!"', 'emerging from the blue zone',
    'setting up an ambush', 'parachuting onto the battlegrounds', 'in the final circle showdown'
];

const MAP_DESCRIPTIONS: Record<string, string> = {
    'Erangel': 'a lush, green Eastern European island with dense forests, rolling grassy hills, and abandoned Soviet-style towns.',
    'Miramar': 'a vast, sun-scorched desert with arid landscapes, rocky canyons, small villages, and a large city.',
    'Sanhok': 'a dense, tropical jungle island inspired by Southeast Asia, with ancient ruins, riverside villages, and thick vegetation.',
    'Vikendi': 'a snow-covered northern European island with frozen lakes, coniferous forests, a dinosaur-themed park, and quaint mountain towns.',
    'Karakin': 'a small, arid North African island with rocky terrain, underground tunnels, and destructible buildings.',
    'a deserted city': 'an abandoned, post-apocalyptic city with crumbling skyscrapers, overgrown streets, and a sense of eerie silence.',
    'a weathered battlefield': 'a war-torn landscape scarred with trenches, craters, and the remnants of past battles, under a grey, overcast sky.'
};


const NUM_IMAGES_TO_GENERATE = 4;

// Pre-defined positions for a scattered look on desktop
const POSITIONS = [
    { top: '5%', left: '10%', rotate: -8 },
    { top: '15%', left: '60%', rotate: 5 },
    { top: '45%', left: '5%', rotate: 3 },
    { top: '2%', left: '35%', rotate: 10 },
];

const GHOST_POLAROIDS_CONFIG = [
  { initial: { x: "-150%", y: "-100%", rotate: -30 }, transition: { delay: 0.2 } },
  { initial: { x: "150%", y: "-80%", rotate: 25 }, transition: { delay: 0.4 } },
  { initial: { x: "-120%", y: "120%", rotate: 45 }, transition: { delay: 0.6 } },
  { initial: { x: "180%", y: "90%", rotate: -20 }, transition: { delay: 0.8 } },
];


type ImageStatus = 'pending' | 'done' | 'error';
interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

interface GenerationItem {
    character: string;
    map: string;
    scenario: string;
}

type Gender = 'Male' | 'Female' | 'Unknown';

const primaryButtonClasses = "font-teko text-2xl tracking-wider text-black bg-yellow-500 py-3 px-10 transform transition-transform duration-200 hover:scale-105 hover:bg-yellow-400 disabled:bg-neutral-600 disabled:text-neutral-400 disabled:cursor-not-allowed disabled:transform-none";
const secondaryButtonClasses = "font-teko text-2xl tracking-wider text-white bg-transparent border-2 border-neutral-400 py-3 px-10 transform transition-transform duration-200 hover:scale-105 hover:bg-neutral-400 hover:text-black";

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }
        const listener = () => setMatches(media.matches);
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    }, [matches, query]);
    return matches;
};

// Fisher-Yates shuffle
const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};


function App() {
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [appState, setAppState] = useState<'idle' | 'analyzing' | 'generating' | 'results-shown'>('idle');
    const [generationItems, setGenerationItems] = useState<GenerationItem[]>([]);
    const [detectedGender, setDetectedGender] = useState<Gender | null>(null);
    const dragAreaRef = useRef<HTMLDivElement>(null);
    const isMobile = useMediaQuery('(max-width: 768px)');
    const generationTriggered = useRef(false); // Ref to prevent re-triggering generation

    useEffect(() => {
        // This effect triggers the generation process once the state is ready.
        if (appState === 'generating' && uploadedImage && !generationTriggered.current) {
            generationTriggered.current = true;
            handleGenerateClick();
        }
    }, [appState, uploadedImage]);


    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = async () => {
                const imageDataUrl = reader.result as string;
                setAppState('analyzing');
                try {
                    const gender = await detectGender(imageDataUrl);
                    let pool: string[] = [];
                    if (gender === 'Male') {
                        pool = MALE_CHARACTERS;
                    } else if (gender === 'Female') {
                        pool = FEMALE_CHARACTERS;
                    } else {
                        // If unknown, combine and shuffle for variety
                        pool = shuffleArray([...MALE_CHARACTERS, ...FEMALE_CHARACTERS]);
                    }
                    
                    // Generate a random loadout
                    const randomOutfits = shuffleArray(pool).slice(0, NUM_IMAGES_TO_GENERATE);
                    const randomMaps = shuffleArray(MAPS);
                    const randomScenarios = shuffleArray(SCENARIOS);

                    const items: GenerationItem[] = randomOutfits.map((character, i) => ({
                        character,
                        map: randomMaps[i % randomMaps.length],
                        scenario: randomScenarios[i % randomScenarios.length],
                    }));
                    
                    setDetectedGender(gender);
                    setGenerationItems(items);
                    setUploadedImage(imageDataUrl);
                    setGeneratedImages({}); // Clear previous results
                    generationTriggered.current = false; // Reset trigger
                    setAppState('generating'); // Go straight to generation
                } catch (error) {
                    console.error("Failed to analyze image:", error);
                    alert("Sorry, we couldn't analyze your photo. Please try another one.");
                    setAppState('idle');
                }
            };
            reader.readAsDataURL(file);
        }
    };
    
    const generatePrompt = (item: GenerationItem, gender: Gender | null): string => {
        const { character, map, scenario } = item;
        
        const genderClause = gender === 'Male' ? ' as a male character' : gender === 'Female' ? ' as a female character' : '';
        const mapDescription = MAP_DESCRIPTIONS[map] || `the battle royale map "${map}"`;

        return `
**PRIORITY 1: FACE ACCURACY & VISIBILITY**
The face of the character in the generated image MUST be a PERFECT and EXACT replica of the face from the uploaded photo. Every facial feature must be preserved. CRITICALLY, the face must be fully visible and NOT be covered by any helmets, masks, or headgear, even if the outfit typically includes them. The goal is to see the person's face clearly.

**PRIORITY 2: SCENE DESCRIPTION**
Reimagine the person from the photo${genderClause}, wearing the iconic PUBG outfit: "${character}".

**ACTION:** Place them in a dynamic, high-action pose, captured mid-moment during this scenario: "${scenario}".

**ENVIRONMENT:** The setting is ${mapDescription}. The environment must be highly detailed, graphically rich, and recognizable as the described map.

**STYLE:** The final output must be a gritty, photorealistic, and cinematic image that looks like a high-resolution screenshot from a next-generation video game.
`;
    };


    const handleGenerateClick = async () => {
        if (!uploadedImage || generationItems.length === 0) return;

        setIsLoading(true);
        
        const initialImages: Record<string, GeneratedImage> = {};
        generationItems.forEach(item => {
            initialImages[item.character] = { status: 'pending' };
        });
        setGeneratedImages(initialImages);

        const concurrencyLimit = 2; // Process two characters at a time
        const itemsQueue = [...generationItems];

        const processItem = async (item: GenerationItem) => {
            try {
                const prompt = generatePrompt(item, detectedGender);
                const resultUrl = await generateCharacterImage(uploadedImage, prompt);
                setGeneratedImages(prev => ({
                    ...prev,
                    [item.character]: { status: 'done', url: resultUrl },
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [item.character]: { status: 'error', error: errorMessage },
                }));
                console.error(`Failed to generate image for ${item.character}:`, err);
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (itemsQueue.length > 0) {
                const item = itemsQueue.shift();
                if (item) {
                    await processItem(item);
                }
            }
        });

        await Promise.all(workers);

        setIsLoading(false);
        setAppState('results-shown');
    };

    const handleRegenerateCharacter = async (character: string) => {
        if (!uploadedImage) return;

        const itemToRegenerate = generationItems.find(item => item.character === character);
        if (!itemToRegenerate) return;

        // Prevent re-triggering if a generation is already in progress
        if (generatedImages[character]?.status === 'pending') {
            return;
        }
        
        console.log(`Regenerating image for ${character}...`);

        // Set the specific character to 'pending' to show the loading spinner
        setGeneratedImages(prev => ({
            ...prev,
            [character]: { status: 'pending' },
        }));

        // Call the generation service for the specific character
        try {
            const prompt = generatePrompt(itemToRegenerate, detectedGender);
            const resultUrl = await generateCharacterImage(uploadedImage, prompt);
            setGeneratedImages(prev => ({
                ...prev,
                [character]: { status: 'done', url: resultUrl },
            }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setGeneratedImages(prev => ({
                ...prev,
                [character]: { status: 'error', error: errorMessage },
            }));
            console.error(`Failed to regenerate image for ${character}:`, err);
        }
    };
    
    const handleReset = () => {
        setUploadedImage(null);
        setGeneratedImages({});
        setDetectedGender(null);
        setGenerationItems([]);
        setAppState('idle');
        generationTriggered.current = false;
    };

    const handleDownloadIndividualImage = (character: string) => {
        const image = generatedImages[character];
        if (image?.status === 'done' && image.url) {
            const link = document.createElement('a');
            link.href = image.url;
            link.download = `pubg-lobby-${character.toLowerCase().replace(/ /g, '-')}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleDownloadAlbum = async () => {
        setIsDownloading(true);
        try {
            const imageData = Object.entries(generatedImages)
                .filter(([, image]) => image.status === 'done' && image.url)
                .reduce((acc, [character, image]) => {
                    acc[character] = image!.url!;
                    return acc;
                }, {} as Record<string, string>);

            if (Object.keys(imageData).length < generationItems.length) {
                alert("Please wait for all images to finish generating before downloading the album.");
                setIsDownloading(false);
                return;
            }

            const albumDataUrl = await createAlbumPage(imageData);

            const link = document.createElement('a');
            link.href = albumDataUrl;
            link.download = 'pubg-lobby-album.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Failed to create or download album:", error);
            alert("Sorry, there was an error creating your album. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleShareIndividualImage = async (character: string) => {
        const image = generatedImages[character];
        if (image?.status !== 'done' || !image.url) {
            alert("Image is not yet ready to be shared.");
            return;
        }

        const text = `Just geared up with the ${character} set in the PUBG Lobby! Check out my AI-generated player card. #PUBGLobby #GoogleAI #nanobanana`;

        try {
            const response = await fetch(image.url);
            const blob = await response.blob();
            const file = new File([blob], `pubg-lobby-${character.toLowerCase().replace(/ /g, '-')}.jpg`, { type: blob.type });

            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `My PUBG Player Card: ${character}`,
                    text: text,
                    files: [file],
                });
            } else {
                // Fallback for browsers that don't support sharing files (e.g., desktop Firefox)
                const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
                window.open(shareUrl, '_blank', 'noopener,noreferrer');
                alert("Your browser doesn't support sharing images directly. Please download the image to share it manually.");
            }
        } catch (error) {
            console.error('Error sharing image:', error);
            // Fallback for any error during fetch or share
            const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
            window.open(shareUrl, '_blank', 'noopener,noreferrer');
            alert("Could not share image. Please download it and share manually.");
        }
    };

    const handleShareAlbum = async () => {
        const text = `Check out my custom AI-generated PUBG player card album! Created with the PUBG Lobby app. #PUBGLobby #GoogleAI #nanobanana`;

        try {
            const imageData = Object.entries(generatedImages)
                .filter(([, image]) => image.status === 'done' && image.url)
                .reduce((acc, [character, image]) => {
                    acc[character] = image!.url!;
                    return acc;
                }, {} as Record<string, string>);

            if (Object.keys(imageData).length === 0) {
                alert("There are no generated images to share in an album.");
                return;
            }

            const albumDataUrl = await createAlbumPage(imageData);
            const response = await fetch(albumDataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'pubg-lobby-album.jpg', { type: blob.type });

            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'My PUBG Lobby Album',
                    text: text,
                    files: [file],
                });
            } else {
                // Fallback for browsers that don't support sharing files
                const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
                window.open(shareUrl, '_blank', 'noopener,noreferrer');
                alert("Your browser doesn't support sharing images directly. Please download the album to share it manually.");
            }
        } catch (error) {
            console.error("Failed to create or share album:", error);
            alert("Sorry, there was an error creating your album for sharing. Please try again.");
        }
    };

    return (
        <main className="bg-transparent text-neutral-200 min-h-screen w-full flex flex-col items-center justify-center p-4 pb-24 overflow-hidden relative">
            
            <div className="z-10 flex flex-col items-center justify-center w-full h-full flex-1 min-h-0">
                <div className="text-center mb-10">
                    <h1 className="text-7xl md:text-9xl font-teko text-neutral-100 uppercase" style={{ WebkitTextStroke: '2px #F59E0B', textShadow: '4px 4px 0px #000' }}>PUBG Lobby</h1>
                    <p className="font-roboto text-neutral-300 mt-2 text-xl tracking-wide">Gear up for the Battlegrounds.</p>
                </div>

                {appState === 'idle' && (
                     <div className="relative flex flex-col items-center justify-center w-full">
                        {/* Ghost polaroids for intro animation */}
                        {GHOST_POLAROIDS_CONFIG.slice(0, 4).map((config, index) => (
                            <motion.div
                                key={index}
                                className="absolute w-48 h-60 bg-neutral-800/50 border-2 border-neutral-700/50 shadow-lg pointer-events-none"
                                initial={config.initial}
                                animate={{ x: "0%", y: "0%", rotate: 0, opacity: [0, 1, 0] }}
                                transition={{ ...config.transition, duration: 2, ease: "easeInOut", opacity: { times: [0, 0.5, 1], duration: 2 }}}
                            />
                        ))}
                        <PolaroidCard caption="You" status="done" />
                        <div className="mt-8">
                             <input type="file" id="file-upload" className="hidden" onChange={handleImageUpload} accept="image/*" />
                             <label htmlFor="file-upload" className={`${primaryButtonClasses} cursor-pointer`}>
                                 Upload Your Photo
                             </label>
                        </div>
                     </div>
                )}

                {appState === 'analyzing' && (
                    <div className="flex flex-col items-center">
                        <PolaroidCard caption="Analyzing..." status="pending" />
                        <p className="font-teko text-neutral-300 mt-8 text-3xl tracking-wider">Analyzing photo...</p>
                    </div>
                )}
                
                {(appState === 'generating' || appState === 'results-shown') && (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                        {appState === 'generating' && (
                             <div className="text-center mb-8">
                                <h2 className="font-teko text-5xl text-yellow-500 tracking-wider">Generating Your Loadout...</h2>
                                <p className="text-neutral-400 mt-1">Please wait, this can take a minute.</p>
                             </div>
                        )}
                        <div ref={dragAreaRef} className={`relative w-full h-full flex-1 ${isMobile ? 'flex flex-col items-center overflow-y-auto space-y-8' : ''}`}>
                            {generationItems.map((item, index) => (
                                <motion.div
                                    key={item.character}
                                    className={isMobile ? 'my-4' : 'absolute'}
                                    initial={{ opacity: 0, scale: 0.5, ...(isMobile ? {} : POSITIONS[index % POSITIONS.length]) }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                    style={isMobile ? {} : {
                                        top: POSITIONS[index % POSITIONS.length].top,
                                        left: POSITIONS[index % POSITIONS.length].left,
                                        rotate: `${POSITIONS[index % POSITIONS.length].rotate}deg`,
                                    }}
                                >
                                    <PolaroidCard
                                        imageUrl={generatedImages[item.character]?.url}
                                        caption={item.character}
                                        status={generatedImages[item.character]?.status ?? 'pending'}
                                        error={generatedImages[item.character]?.error}
                                        dragConstraintsRef={dragAreaRef}
                                        onShake={handleRegenerateCharacter}
                                        onDownload={handleDownloadIndividualImage}
                                        onShare={handleShareIndividualImage}
                                        isMobile={isMobile}
                                    />
                                </motion.div>
                            ))}
                        </div>

                        {appState === 'results-shown' && (
                           <div className="z-20 mt-8 mb-4 flex flex-col sm:flex-row items-center gap-4">
                               <button onClick={handleDownloadAlbum} className={primaryButtonClasses} disabled={isDownloading}>
                                   {isDownloading ? "Preparing..." : "Download Album"}
                               </button>
                               <button onClick={handleShareAlbum} className={primaryButtonClasses}>
                                   Share Album
                               </button>
                               <button onClick={handleReset} className={secondaryButtonClasses}>
                                   Return to Lobby
                               </button>
                           </div>
                        )}
                    </div>
                )}
            </div>

            <Footer />
        </main>
    );
}
export default App;