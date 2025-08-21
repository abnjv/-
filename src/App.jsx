import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, addDoc, updateDoc } from 'firebase/firestore';

// Import the configuration for Firebase
import { firebaseConfig, appId, initialAuthToken } from './firebase-config.js';

// Initial board setup
const initialBoard = new Map([
    ['a8', 'r'], ['b8', 'n'], ['c8', 'b'], ['d8', 'q'], ['e8', 'k'], ['f8', 'b'], ['g8', 'n'], ['h8', 'r'],
    ['a7', 'p'], ['b7', 'p'], ['c7', 'p'], ['d7', 'p'], ['e7', 'p'], ['f7', 'p'], ['g7', 'p'], ['h7', 'p'],
    ['a2', 'P'], ['b2', 'P'], ['c2', 'P'], ['d2', 'P'], ['e2', 'P'], ['f2', 'P'], ['g2', 'P'], ['h2', 'P'],
    ['a1', 'R'], ['b1', 'N'], ['c1', 'B'], ['d1', 'Q'], ['e1', 'K'], ['f1', 'B'], ['g1', 'N'], ['h1', 'R'],
]);

// Symbols for the chess pieces
const pieceSymbols = {
    'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚',
    'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♛', 'K': '♔',
};

// Create a simple synth for audio feedback
const synth = new Tone.Synth().toDestination();
const playMoveSound = () => {
    synth.triggerAttackRelease("C4", "8n");
};

// #region Chess Logic
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const getPieceColor = (piece) => (piece === piece.toUpperCase() ? 'w' : 'b');

function getPseudoLegalMoves(square, board) {
    const piece = board.get(square);
    if (!piece) return [];

    const pieceColor = getPieceColor(piece);
    const pieceType = piece.toLowerCase();
    const moves = [];
    const rank = parseInt(square[1]);
    const fileIndex = files.indexOf(square[0]);

    const addSlidingMoves = (directions) => {
        directions.forEach(([r_dir, f_dir]) => {
            let r = rank + r_dir, f = fileIndex + f_dir;
            while (r >= 1 && r <= 8 && f >= 0 && f < 8) {
                const targetSquare = files[f] + r;
                const targetPiece = board.get(targetSquare);
                if (!targetPiece) {
                    moves.push(targetSquare);
                } else {
                    if (getPieceColor(targetPiece) !== pieceColor) {
                        moves.push(targetSquare);
                    }
                    break;
                }
                r += r_dir; f += f_dir;
            }
        });
    };

    const addSingleMove = (r, f) => {
        if (r >= 1 && r <= 8 && f >= 0 && f < 8) {
            const targetSquare = files[f] + r;
            const targetPiece = board.get(targetSquare);
            if (!targetPiece || getPieceColor(targetPiece) !== pieceColor) {
                moves.push(targetSquare);
            }
        }
    };

    if (pieceType === 'p') {
        const dir = pieceColor === 'w' ? 1 : -1;
        // Forward 1
        if (!board.has(files[fileIndex] + (rank + dir))) moves.push(files[fileIndex] + (rank + dir));
        // Forward 2
        const startRank = pieceColor === 'w' ? 2 : 7;
        if (rank === startRank && !board.has(files[fileIndex] + (rank + dir)) && !board.has(files[fileIndex] + (rank + 2 * dir))) {
            moves.push(files[fileIndex] + (rank + 2 * dir));
        }
        // Captures
        [-1, 1].forEach(offset => {
            if (fileIndex + offset >= 0 && fileIndex + offset < 8) {
                const targetSquare = files[fileIndex + offset] + (rank + dir);
                const targetPiece = board.get(targetSquare);
                if (targetPiece && getPieceColor(targetPiece) !== pieceColor) {
                    moves.push(targetSquare);
                }
            }
        });
    } else if (pieceType === 'n') {
        const knightMoves = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
        knightMoves.forEach(([r_offset, f_offset]) => addSingleMove(rank + r_offset, fileIndex + f_offset));
    } else if (pieceType === 'k') {
        const kingMoves = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
        kingMoves.forEach(([r_offset, f_offset]) => addSingleMove(rank + r_offset, fileIndex + f_offset));
    } else { // R, B, Q
        const directions = {
            'r': [[1, 0], [-1, 0], [0, 1], [0, -1]],
            'b': [[1, 1], [1, -1], [-1, 1], [-1, -1]],
            'q': [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
        };
        if (directions[pieceType]) addSlidingMoves(directions[pieceType]);
    }
    return moves;
}

function isSquareAttacked(square, attackerColor, board) {
    for (const [s, p] of board.entries()) {
        if (getPieceColor(p) === attackerColor) {
            const moves = getPseudoLegalMoves(s, board);
            if (moves.includes(square)) {
                return true;
            }
        }
    }
    return false;
}
// #endregion

// Main App Component
export default function App() {
    // Game state
    const [board, setBoard] = useState(new Map());
    const [fromSquare, setFromSquare] = useState(null);
    const [validMoves, setValidMoves] = useState([]);
    const [statusMessage, setStatusMessage] = useState('يرجى الاتصال باللعبة...');
    const [playerColor, setPlayerColor] = useState(null);
    const [turn, setTurn] = useState(null);
    const [roomId, setRoomId] = useState('');
    const [loading, setLoading] = useState(true);
    const [timer, setTimer] = useState(30);
    const [isGameOver, setIsGameOver] = useState(false);
    const [enPassantTarget, setEnPassantTarget] = useState(null);
    const [castlingRights, setCastlingRights] = useState({ w: { k: true, q: true }, b: { k: true, q: true } });
    const timerRef = useRef();

    // Firestore and Auth state
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);

    // Initialize Firebase and authenticate user
    useEffect(() => {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authService = getAuth(app);
        setDb(firestore);
        setAuth(authService);

        const unsubscribe = onAuthStateChanged(authService, async (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
            } else {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(authService, initialAuthToken);
                    } else {
                        await signInAnonymously(authService);
                    }
                } catch (error) {
                    console.error('Authentication error:', error);
                }
            }
        });

        return () => unsubscribe();
    }, []);

    // Listen for real-time game updates from Firestore and manage timer
    useEffect(() => {
        if (!isAuthReady || !db || !roomId) return;

        const roomRef = doc(db, `/artifacts/${appId}/public/data/chess_games/${roomId}`);
        const unsubscribe = onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setBoard(new Map(Object.entries(data.board)));
                setTurn(data.turn);
                setEnPassantTarget(data.enPassantTarget || null);
                setCastlingRights(data.castlingRights || { w: { k: true, q: true }, b: { k: true, q: true } });

                // Set the timer based on the last move timestamp
                const now = Date.now();
                const timeElapsed = data.lastMoveTimestamp ? Math.floor((now - data.lastMoveTimestamp) / 1000) : 0;
                const remainingTime = Math.max(0, 30 - timeElapsed);
                setTimer(remainingTime);

                if (data.isGameOver) {
                    setIsGameOver(true);
                    setStatusMessage(data.statusMessage);
                } else if (remainingTime === 0) {
                    setIsGameOver(true);
                    setStatusMessage(`انتهى وقت اللاعب ${data.turn === 'w' ? 'الأبيض' : 'الأسود'}! اللاعب ${data.turn === 'w' ? 'الأسود' : 'الأبيض'} هو الفائز.`);
                } else {
                    const isOurTurn = data.turn === playerColor;
                    setStatusMessage(isOurTurn ? 'دورك للتحرك.' : 'دور خصمك...');
                    if (isOurTurn) {
                        const kingSquare = [...data.board.entries()].find(([s,p]) => p.toLowerCase() === 'k' && getPieceColor(p) === playerColor)?.[0];
                        if (kingSquare && isSquareAttacked(kingSquare, playerColor === 'w' ? 'b' : 'w', new Map(Object.entries(data.board)))) {
                             setStatusMessage( 'كش ملك! تحرك بملكك.');
                        }
                    }
                }

            } else {
                setStatusMessage('تم حذف الغرفة. يرجى إنشاء غرفة جديدة.');
            }
            setLoading(false);
        }, (error) => {
            console.error('Firestore subscription error:', error);
            setStatusMessage('حدث خطأ في الاتصال باللعبة.');
        });

        return () => unsubscribe();
    }, [db, roomId, isAuthReady, playerColor]);

    // Timer countdown logic
    useEffect(() => {
        if (isGameOver || turn !== playerColor) {
            clearInterval(timerRef.current);
            return;
        }

        timerRef.current = setInterval(() => {
            setTimer(prevTime => {
                if (prevTime <= 1) {
                    clearInterval(timerRef.current);
                    setIsGameOver(true);
                    setStatusMessage(`انتهى وقتك! اللاعب ${playerColor === 'w' ? 'الأسود' : 'الأبيض'} هو الفائز.`);
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [turn, playerColor, isGameOver]);

    // Function to update the game state in Firestore
    const updateGameState = async (newBoard, newTurn, newEnPassantTarget, newCastlingRights, gameOver = false, message = '') => {
        if (!roomId) return;
        const roomRef = doc(db, `/artifacts/${appId}/public/data/chess_games/${roomId}`);
        try {
            await updateDoc(roomRef, {
                board: Object.fromEntries(newBoard),
                turn: newTurn,
                lastMoveTimestamp: Date.now(),
                enPassantTarget: newEnPassantTarget,
                castlingRights: newCastlingRights,
                isGameOver: gameOver,
                statusMessage: message,
            });
            setTimer(30);
        } catch (error) {
            console.error('Error updating game state:', error);
            setStatusMessage('فشل تحديث حالة اللعبة.');
        }
    };

    const getValidMoves = (square, board, castlingRights, enPassantTarget) => {
        const piece = board.get(square);
        const pieceColor = getPieceColor(piece);
        const kingSquare = [...board.entries()].find(([s, p]) => p.toLowerCase() === 'k' && getPieceColor(p) === pieceColor)?.[0];

        let pseudoMoves = getPseudoLegalMoves(square, board);

        // Add special moves
        if (piece.toLowerCase() === 'p') {
            const rank = parseInt(square[1]);
            const dir = getPieceColor(piece) === 'w' ? 1 : -1;
             [-1, 1].forEach(offset => {
                const newFileIndex = files.indexOf(square[0]) + offset;
                if (newFileIndex >= 0 && newFileIndex < 8) {
                    const targetSquare = files[newFileIndex] + (rank + dir);
                    if (targetSquare === enPassantTarget) pseudoMoves.push(targetSquare);
                }
            });
        } else if (piece.toLowerCase() === 'k') {
            const rank = square[1];
            const opponentColor = pieceColor === 'w' ? 'b' : 'w';
            if (castlingRights[pieceColor]?.k && !board.has('f'+rank) && !board.has('g'+rank) && !isSquareAttacked('e'+rank, opponentColor, board) && !isSquareAttacked('f'+rank, opponentColor, board) && !isSquareAttacked('g'+rank, opponentColor, board) ) {
                pseudoMoves.push('g'+rank);
            }
            if (castlingRights[pieceColor]?.q && !board.has('d'+rank) && !board.has('c'+rank) && !board.has('b'+rank) && !isSquareAttacked('e'+rank, opponentColor, board) && !isSquareAttacked('d'+rank, opponentColor, board) && !isSquareAttacked('c'+rank, opponentColor, board)) {
                pseudoMoves.push('c'+rank);
            }
        }

        // Filter out moves that leave the king in check
        return pseudoMoves.filter(move => {
            const tempBoard = new Map(board);
            tempBoard.set(move, piece);
            tempBoard.delete(square);
            const newKingSquare = piece.toLowerCase() === 'k' ? move : kingSquare;
            return !isSquareAttacked(newKingSquare, pieceColor === 'w' ? 'b' : 'w', tempBoard);
        });
    };

    // Function to handle a move on the board
    const handleMove = (move) => {
        if (turn !== playerColor || isGameOver) {
            setStatusMessage('انتظر دورك للتحرك.');
            return;
        }

        const { from, to } = move;
        const piece = board.get(from);

        if (!validMoves.includes(to)) {
            setStatusMessage('هذه الحركة غير صالحة.');
            setFromSquare(null);
            setValidMoves([]);
            return;
        }

        const newBoard = new Map(board);
        const pieceType = piece.toLowerCase();
        let newEnPassantTarget = null;
        const newCastlingRights = JSON.parse(JSON.stringify(castlingRights));

        // Move piece
        newBoard.set(to, piece);
        newBoard.delete(from);

        // Handle special moves
        if (pieceType === 'p') {
            if (to === enPassantTarget) {
                const capturedPawnRank = to[1] === '6' ? '5' : '4';
                newBoard.delete(to[0] + capturedPawnRank);
            }
            if (Math.abs(from[1] - to[1]) === 2) {
                newEnPassantTarget = from[0] + (parseInt(from[1]) + (getPieceColor(piece) === 'w' ? 1 : -1));
            }
            if (to[1] === '8' || to[1] === '1') {
                newBoard.set(to, getPieceColor(piece) === 'w' ? 'Q' : 'q');
            }
        } else if (pieceType === 'k') {
            if (Math.abs(files.indexOf(from[0]) - files.indexOf(to[0])) === 2) {
                const rookFile = to[0] === 'g' ? 'h' : 'a';
                const newRookFile = to[0] === 'g' ? 'f' : 'd';
                const rank = from[1];
                const rook = newBoard.get(rookFile + rank);
                newBoard.delete(rookFile + rank);
                newBoard.set(newRookFile + rank, rook);
            }
            newCastlingRights[getPieceColor(piece)].k = false;
            newCastlingRights[getPieceColor(piece)].q = false;
        } else if (pieceType === 'r') {
            if (from === 'a1') newCastlingRights.w.q = false;
            if (from === 'h1') newCastlingRights.w.k = false;
            if (from === 'a8') newCastlingRights.b.q = false;
            if (from === 'h8') newCastlingRights.b.k = false;
        }

        // Check for game over
        const newTurn = turn === 'w' ? 'b' : 'w';
        const opponentMoves = [];
        for(const [sq, p] of newBoard.entries()){
            if(getPieceColor(p) === newTurn){
                opponentMoves.push(...getValidMoves(sq, newBoard, newCastlingRights, newEnPassantTarget));
            }
        }

        let newIsGameOver = false;
        let newStatusMessage = '';
        if(opponentMoves.length === 0){
            newIsGameOver = true;
            const opponentKingSquare = [...newBoard.entries()].find(([s, p]) => p.toLowerCase() === 'k' && getPieceColor(p) === newTurn)?.[0];
            if(isSquareAttacked(opponentKingSquare, turn, newBoard)){
                newStatusMessage = `كش ملك! اللاعب ${turn === 'w' ? 'الأبيض' : 'الأسود'} هو الفائز.`;
            } else {
                newStatusMessage = "جمود! انتهت اللعبة بالتعادل.";
            }
        }

        updateGameState(newBoard, newTurn, newEnPassantTarget, newCastlingRights, newIsGameOver, newStatusMessage);
        playMoveSound();

        setFromSquare(null);
        setValidMoves([]);
    };

    // Handle square click logic
    const handleSquareClick = (square) => {
        const piece = board.get(square);
        const pieceColor = piece ? getPieceColor(piece) : null;

        if (fromSquare) {
            handleMove({ from: fromSquare, to: square });
        } else {
            if (piece && pieceColor === playerColor && turn === playerColor) {
                setFromSquare(square);
                setValidMoves(getValidMoves(square, board, castlingRights, enPassantTarget));
                setStatusMessage('اختر مربعًا للتحرك إليه...');
            } else if (turn !== playerColor) {
                setStatusMessage('ليس دورك.');
            } else if (piece) {
                setStatusMessage('هذه ليست قطعتك! اختر قطعة من نفس لونك.');
            } else {
                setStatusMessage('اختر قطعة أولاً.');
            }
        }
    };

    // Component for a single chess square
    const ChessSquare = ({ squareName }) => {
        const piece = board.get(squareName);
        const files = playerColor === 'w' ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
        const ranks = playerColor === 'w' ? ['8', '7', '6', '5', '4', '3', '2', '1'] : ['1', '2', '3', '4', '5', '6', '7', '8'];
        const file = squareName[0];
        const rank = squareName[1];
        const isLight = (files.indexOf(file) + ranks.indexOf(rank)) % 2 === 0;
        const isSelected = fromSquare === squareName;
        const isValidMove = validMoves.includes(squareName);

        return (
            <div
                onClick={() => handleSquareClick(squareName)}
                className={`w-12 h-12 md:w-16 md:h-16 flex justify-center items-center text-2xl md:text-4xl
                    ${isLight ? 'bg-gray-200 text-gray-800' : 'bg-gray-600 text-white'}
                    ${isSelected ? 'border-4 border-yellow-500' : ''}
                    ${isValidMove ? 'bg-blue-500 bg-opacity-70 cursor-pointer' : ''}
                    ${piece ? 'cursor-pointer' : ''}`}
            >
                {pieceSymbols[piece] || ''}
            </div>
        );
    };

    // Component for the entire chess board
    const ChessBoard = () => {
        const squares = [];
        const ranks = playerColor === 'w' ? ['8', '7', '6', '5', '4', '3', '2', '1'] : ['1', '2', '3', '4', '5', '6', '7', '8'];
        const files = playerColor === 'w' ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

        for (const rank of ranks) {
            for (const file of files) {
                const squareName = `${file}${rank}`;
                squares.push(<ChessSquare key={squareName} squareName={squareName} />);
            }
        }
        return (
            <div className="w-full max-w-lg aspect-square grid grid-cols-8 grid-rows-8 border-4 border-gray-800 rounded-lg overflow-hidden">
                {squares}
            </div>
        );
    };

    // Function to create a new game room
    const createNewGame = async () => {
        if (!db) return;
        setLoading(true);
        const gameRef = doc(collection(db, `/artifacts/${appId}/public/data/chess_games`));
        await setDoc(gameRef, {
            board: Object.fromEntries(initialBoard),
            turn: 'w',
            lastMoveTimestamp: Date.now(),
            player1Id: userId,
            player2Id: null,
            createdAt: new Date(),
        });
        setPlayerColor('w');
        setRoomId(gameRef.id);
        setStatusMessage('تم إنشاء غرفة جديدة! شارك هذا المعرّف مع صديقك.');
    };

    // Function to join an existing game room
    const joinGame = async (id) => {
        if (!db) return;
        setLoading(true);
        const roomRef = doc(db, `/artifacts/${appId}/public/data/chess_games/${id}`);
        const roomSnap = await getDoc(roomRef);

        if (roomSnap.exists() && !roomSnap.data().player2Id) {
            await updateDoc(roomRef, {
                player2Id: userId,
            });
            setPlayerColor('b');
            setRoomId(id);
            setStatusMessage('تم الانضمام إلى اللعبة بنجاح! أنت تلعب بالأسود.');
        } else {
            setStatusMessage('هذه الغرفة غير موجودة أو ممتلئة.');
        }
        setShowJoinModal(false);
    };

    // Main UI rendering
    if (!isAuthReady || loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
                <p>يتم التحميل... يرجى الانتظار.</p>
            </div>
        );
    }

    // Modal for joining a game
    const JoinModal = () => (
        <div className="fixed inset-0 bg-gray-950 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">انضم إلى غرفة</h2>
                <input
                    type="text"
                    placeholder="أدخل معرّف الغرفة..."
                    className="w-full p-2 mb-4 rounded-lg bg-gray-700 text-white placeholder-gray-400"
                    onChange={(e) => setRoomId(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => setShowJoinModal(false)}
                        className="py-2 px-4 rounded-lg bg-gray-600 hover:bg-gray-700 transition-colors"
                    >
                        إلغاء
                    </button>
                    <button
                        onClick={() => joinGame(roomId)}
                        className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors"
                    >
                        انضمام
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center p-4 relative">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-700 bg-opacity-75 rounded-full px-4 py-2 shadow-lg z-10">
                <h2 className="text-sm sm:text-lg font-bold text-gray-300">مصمم هذه اللعبة: أبو بكر العالمي</h2>
            </div>

            <h1 className="text-4xl font-bold mb-8 mt-16 sm:mt-8">لعبة الشطرنج</h1>

            {roomId ? (
                <>
                    <div className="text-center w-full max-w-lg mb-4">
                        <p className={`text-3xl font-bold transition-all duration-300 ${turn === playerColor ? 'text-green-400' : 'text-red-400'}`}>
                            {timer}
                        </p>
                    </div>
                    <ChessBoard />
                    <div className="mt-8 p-4 bg-gray-800 rounded-lg shadow-xl text-center w-full max-w-lg">
                        <p className="text-lg font-medium">{statusMessage}</p>
                        <p className="mt-2 text-sm text-gray-400">
                           معرّف غرفتك: <span className="font-mono text-white select-all">{roomId}</span>
                        </p>
                        <p className="mt-1 text-sm text-gray-400">
                           لونك: <span className="font-semibold">{playerColor === 'w' ? 'أبيض' : 'أسود'}</span>
                        </p>
                    </div>
                </>
            ) : (
                <div className="text-center p-4 bg-gray-800 rounded-lg shadow-xl w-full max-w-sm">
                    <p className="text-lg font-medium mb-4">انضم أو أنشئ لعبة</p>
                    <div className="flex flex-col gap-4">
                        <button
                            onClick={createNewGame}
                            className="py-3 px-6 rounded-lg bg-green-600 hover:bg-green-700 transition-colors text-white font-semibold"
                        >
                            إنشاء لعبة جديدة
                        </button>
                        <button
                            onClick={() => setShowJoinModal(true)}
                            className="py-3 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-white font-semibold"
                        >
                            الانضمام إلى لعبة
                        </button>
                    </div>
                </div>
            )}

            {showJoinModal && <JoinModal />}

            <div className="mt-8 text-center text-gray-500 text-xs">
                <p>معرّف المستخدم الخاص بك: {userId}</p>
            </div>
        </div>
    );
}
