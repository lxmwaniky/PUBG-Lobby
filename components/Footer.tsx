/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

const Footer = () => {
    return (
        <footer className="fixed bottom-0 left-0 right-0 bg-neutral-900/80 backdrop-blur-sm p-3 z-50 text-neutral-300 text-xs sm:text-sm border-t border-white/10">
            <div className="max-w-screen-xl mx-auto flex justify-center items-center">
                <p className="text-neutral-500">
                    Created by{' '}
                    <a
                        href="https://x.com/lxmwaniky"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-400 hover:text-yellow-500 transition-colors duration-200"
                    >
                        @lxmwaniky
                    </a>
                </p>
            </div>
        </footer>
    );
};

export default Footer;