"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import io from "socket.io-client";

export default function GamePage() {
  const router = useRouter();
  const [socket, setSocket] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<any>(null);
  const [currentTask, setCurrentTask] = useState<string>("");
  const [taskType, setTaskType] = useState<string>("");
  const [spinning, setSpinning] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState("");
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [myId, setMyId] = useState("");
  const [showChoice, setShowChoice] = useState(false);
  const [myTruthStreak, setMyTruthStreak] = useState(0);
  const [customTask, setCustomTask] = useState("");
  const [autoMode, setAutoMode] = useState(true);
  const [mutedPlayers, setMutedPlayers] = useState<{ [key: string]: boolean }>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [bottleRotation, setBottleRotation] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{ [key: string]: MediaStream }>({});
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

  // Пикантные смайлики
  const spicyEmojis = [
    "😘", "😍", "🥰", "😏", "🔥", "💋", "💕", "💖", "💗", "💓",
    "💞", "💝", "❤️", "🧡", "💛", "💚", "💙", "💜", "🤤", "😋",
    "👅", "🍑", "🍆", "🥵", "🌶️", "💦", "👄", "💃", "🕺", "🍷",
    "🍾", "🥂", "🎭", "🎪", "🎨", "🎬", "🎤", "🎧", "🎵", "🎶",
    "🌹", "🌺", "🌸", "🌼", "🌻", "🌷", "💐", "🎀", "💎", "👑"
  ];

  const handleEmojiClick = (emoji: string) => {
    setMessageText(messageText + emoji);
    setShowEmojiPicker(false);
  };

  // Компонент аватара (поддерживает эмодзи и изображения)
  const Avatar = ({ player, size = "md" }: { player: any; size?: "sm" | "md" | "lg" }) => {
    const sizes = {
      sm: "w-8 h-8 text-xl",
      md: "w-12 h-12 text-3xl",
      lg: "w-16 h-16 text-4xl"
    };
    
    if (player.avatarType === "image") {
      return (
        <img 
          src={player.avatar} 
          alt={player.name}
          className={`${sizes[size].split(' ').slice(0, 2).join(' ')} rounded-full object-cover border-2 border-purple-500`}
        />
      );
    }
    
    return (
      <div className={`${sizes[size]} flex items-center justify-center`}>
        {player.avatar}
      </div>
    );
  };

  useEffect(() => {
    const name = localStorage.getItem("playerName");
    const gender = localStorage.getItem("playerGender");
    const avatar = localStorage.getItem("playerAvatar");
    const avatarType = localStorage.getItem("playerAvatarType");
    const hostToken = localStorage.getItem("hostToken");
    const isHostUser = localStorage.getItem("isHost") === "true";

    if (!name && !hostToken) {
      router.push("/");
      return;
    }

    setIsHost(isHostUser);

    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000");
    setSocket(newSocket);

    newSocket.on("connect", () => {
      setMyId(newSocket.id || "");
      newSocket.emit("register", {
        roomId: "main",
        name: isHostUser ? "Ведущий" : name,
        avatar: isHostUser ? "👑" : avatar,
        avatarType: isHostUser ? "emoji" : (avatarType || "emoji"),
        gender: isHostUser ? "host" : gender,
        isHost: isHostUser,
      });
    });

    newSocket.on("roomUpdate", (data: any) => {
      setPlayers(data.players);
      setGameStarted(data.gameState.started);
      if (data.gameState.currentPlayer) {
        setCurrentPlayer(data.gameState.currentPlayer);
      }
    });

    newSocket.on("gameStarted", () => {
      setGameStarted(true);
    });

    newSocket.on("bottleSpinning", (data: any) => {
      setSpinning(true);
      // Получаем угол вращения с сервера
      if (data && data.rotation) {
        setBottleRotation(prev => prev + data.rotation);
      }
    });

    newSocket.on("playerSelected", (data: any) => {
      setSpinning(false);
      setCurrentPlayer(data.playerId);
      // Показываем выбор только выбранному игроку и не админу
      if (data.playerId === newSocket.id && !isHostUser) {
        setMyTruthStreak(data.truthStreak || 0);
        setShowChoice(true);
        // Запрос на включение камеры
        if (!cameraEnabled) {
          requestCameraAccess();
        }
      }
    });

    newSocket.on("taskAssigned", (data: any) => {
      setCurrentTask(data.task);
      setTaskType(data.type);
      setShowChoice(false);
    });

    newSocket.on("mustChooseDare", (data: any) => {
      alert(data.message);
      // Автоматически выбираем действие
      handleChooseType("dare");
    });

    newSocket.on("taskFinished", () => {
      setCurrentTask("");
      setTaskType("");
      setCurrentPlayer(null);
    });

    newSocket.on("newMessage", (msg: any) => {
      setMessages((prev) => [...prev, msg]);
    });

    // WebRTC setup
    if (isHostUser) {
      // Админ видит все камеры, но сам не показывает свою
      console.log("Админ подключен - будет видеть все камеры");
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      newSocket.disconnect();
    };
  }, [router]);

  // Функция запроса доступа к камере
  const requestCameraAccess = async () => {
    const userConfirmed = window.confirm("Включить камеру для выполнения задания?");
    if (userConfirmed) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        setCameraEnabled(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        // Отправляем стрим всем (админу)
        if (socket) {
          socket.emit("cameraEnabled", { roomId: "main" });
        }
      } catch (err) {
        console.error("Ошибка доступа к камере:", err);
        alert("Не удалось получить доступ к камере");
      }
    }
  };

  // Включение/выключение камеры вручную
  const toggleCamera = async () => {
    if (cameraEnabled && localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      setCameraEnabled(false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    } else {
      await requestCameraAccess();
    }
  };

  const handleReady = () => {
    if (socket) {
      socket.emit("playerReady", { roomId: "main" });
    }
  };

  const handleStartGame = () => {
    if (socket) {
      socket.emit("startGame", { roomId: "main" });
    }
  };

  const handleSpin = () => {
    if (socket && !spinning) {
      socket.emit("spinBottle", { roomId: "main" });
    }
  };

  const handleChooseType = (type: string) => {
    if (socket) {
      socket.emit("chooseType", { roomId: "main", type });
    }
  };

  const handleTaskComplete = (success: boolean) => {
    if (socket) {
      socket.emit("taskCompleted", { roomId: "main", success });
    }
  };

  const handleSendMessage = () => {
    if (socket && messageText.trim()) {
      socket.emit("sendMessage", { roomId: "main", message: messageText });
      setMessageText("");
    }
  };

  const handleUpdateScore = (playerId: string, delta: number) => {
    if (socket) {
      socket.emit("hostUpdateScore", { roomId: "main", playerId, delta });
    }
  };

  const handleMutePlayer = (playerId: string) => {
    if (socket) {
      const isMuted = !mutedPlayers[playerId];
      setMutedPlayers({ ...mutedPlayers, [playerId]: isMuted });
      socket.emit("hostMutePlayer", { roomId: "main", playerId, mute: isMuted });
    }
  };

  const handleSelectPlayer = (playerId: string) => {
    if (socket && !autoMode) {
      socket.emit("hostSelectPlayer", { roomId: "main", playerId });
      setCurrentPlayer(playerId);
    }
  };

  const handleSendCustomTask = () => {
    if (socket && customTask.trim()) {
      socket.emit("hostCustomTask", { roomId: "main", task: customTask });
      setCustomTask("");
    }
  };

  // ПАНЕЛЬ УПРАВЛЕНИЯ ВЕДУЩЕГО
  if (isHost) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl p-4 mb-4 shadow-2xl">
            <h1 className="text-3xl font-bold text-white text-center flex items-center justify-center gap-2">
              👑 Панель управления ведущего
            </h1>
          </div>

          {!gameStarted ? (
            <div className="bg-white/95 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">🎮 Лобби - Игроки</h2>
              
              <div className="space-y-3 mb-6">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-4 p-4 bg-gradient-to-r from-pink-100 to-purple-100 rounded-xl"
                  >
                    {player.avatarType === "image" ? (
                      <img 
                        src={player.avatar} 
                        alt={player.name}
                        className="w-16 h-16 rounded-full object-cover border-2 border-purple-500"
                      />
                    ) : (
                      <div className="text-4xl">{player.avatar}</div>
                    )}
                    <div className="flex-1">
                      <div className="font-bold text-gray-800">{player.name}</div>
                      <div className="text-sm text-gray-600">
                        {player.gender === "male" ? "👨 Парень" : "👩 Девушка"}
                      </div>
                    </div>
                    {player.isReady && (
                      <div className="text-green-600 font-bold">✓ Готов</div>
                    )}
                  </div>
                ))}
                {players.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    Ожидание игроков...
                  </div>
                )}
              </div>

              <button
                onClick={handleStartGame}
                disabled={players.length < 2}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold text-lg rounded-xl shadow-lg hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🚀 Начать игру ({players.length} игроков)
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* ЛЕВАЯ КОЛОНКА - Управление игрой */}
              <div className="xl:col-span-2 space-y-4">
                {/* Стол с бутылочкой */}
                <div className="bg-white/95 rounded-2xl p-6 shadow-2xl">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">🍾 Стол</h3>
                    {!currentPlayer && (
                      <button
                        onClick={handleSpin}
                        disabled={spinning}
                        className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold rounded-xl shadow-lg hover:scale-105 transition disabled:opacity-50 text-sm"
                      >
                        {spinning ? 'Вращается...' : '🔄 Крутить (Вмешаться)'}
                      </button>
                    )}
                  </div>
                  <div className="relative w-full aspect-square bg-gradient-to-br from-amber-700 via-amber-600 to-amber-800 rounded-full flex items-center justify-center shadow-inner" style={{ maxHeight: "400px" }}>
                    {/* Круглый стол */}
                    <div className="absolute inset-4 bg-gradient-to-br from-amber-800 to-amber-900 rounded-full shadow-2xl"></div>
                    
                    {/* Игроки по кругу С КАМЕРАМИ */}
                    {players.map((player, index) => {
                      const angle = (index / players.length) * 2 * Math.PI - Math.PI / 2;
                      const radius = 42;
                      const x = 50 + radius * Math.cos(angle);
                      const y = 50 + radius * Math.sin(angle);
                      
                      return (
                        <div
                          key={player.id}
                          className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
                            currentPlayer === player.id ? 'scale-125 z-10' : 'scale-100'
                          } transition-all duration-300`}
                          style={{ left: `${x}%`, top: `${y}%` }}
                        >
                          <div className={`relative ${currentPlayer === player.id ? 'animate-pulse' : ''}`}>
                            {/* КАМЕРА ИГРОКА (админ видит всегда) */}
                            <div className="relative w-20 h-20">
                              {/* Видео поток */}
                              <video
                                ref={(el) => { if (el) videoRefs.current[player.id] = el; }}
                                autoPlay
                                muted
                                className={`w-20 h-20 rounded-full object-cover border-4 ${
                                  currentPlayer === player.id ? 'border-pink-500' : 'border-white'
                                } shadow-xl bg-gray-900`}
                              />
                              {/* Аватар поверх видео если камера отключена */}
                              <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-full">
                                {player.avatarType === "image" ? (
                                  <img 
                                    src={player.avatar} 
                                    alt={player.name}
                                    className="w-full h-full rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="text-4xl">{player.avatar}</div>
                                )}
                              </div>
                            </div>
                            <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-white px-2 py-1 rounded-full shadow-lg text-xs font-bold text-gray-800 whitespace-nowrap">
                              {player.name}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Бутылочка в центре */}
                    <div 
                      className="absolute text-6xl transition-transform duration-2000 ease-out"
                      style={{ 
                        transform: `rotate(${bottleRotation}deg)`,
                        transitionDuration: spinning ? '2000ms' : '0ms'
                      }}
                    >
                      🍾
                    </div>
                  </div>
                  
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setAutoMode(!autoMode)}
                      className={`flex-1 px-6 py-3 font-bold rounded-xl shadow-lg transition ${
                        autoMode
                          ? "bg-green-500 text-white"
                          : "bg-gray-500 text-white"
                      }`}
                    >
                      {autoMode ? "🤖 Режим: Авто (игроки сами)" : "✋ Режим: Ручной (только админ)"}
                    </button>
                  </div>
                </div>

                {/* Текущее задание */}
                {currentTask && (
                  <div className="bg-gradient-to-r from-pink-500 to-purple-500 rounded-2xl p-6 shadow-2xl text-white">
                    <h3 className="text-xl font-bold mb-2">
                      {taskType === "truth" ? "🤔 Правда" : "🔥 Действие"}
                    </h3>
                    <p className="text-lg">{currentTask}</p>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => handleTaskComplete(true)}
                        className="flex-1 py-2 bg-green-600 rounded-xl font-bold hover:bg-green-700"
                      >
                        ✓ Выполнил
                      </button>
                      <button
                        onClick={() => handleTaskComplete(false)}
                        className="flex-1 py-2 bg-red-600 rounded-xl font-bold hover:bg-red-700"
                      >
                        ✗ Не выполнил
                      </button>
                    </div>
                  </div>
                )}

                {/* Свое задание */}
                <div className="bg-white/95 rounded-2xl p-6 shadow-2xl">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">📝 Вмешаться: Свое задание</h3>
                  <textarea
                    value={customTask}
                    onChange={(e) => setCustomTask(e.target.value)}
                    placeholder="Введите свое задание для выбранного игрока...\n\nЗадание заменит текущее автоматическое."
                    className="w-full p-3 border-2 border-purple-300 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 mb-3"
                    rows={4}
                  />
                  <button
                    onClick={handleSendCustomTask}
                    disabled={!customTask.trim() || !currentPlayer}
                    className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:scale-105 transition disabled:opacity-50"
                  >
                    📤 Отправить свое задание (переопределить)
                  </button>
                  {!currentPlayer && (
                    <p className="text-sm text-gray-500 mt-2 text-center">Сначала выберите игрока (покрутите бутылочку)</p>
                  )}
                </div>

                {/* Чат */}
                <div className="bg-white/95 rounded-2xl p-6 shadow-2xl">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">💬 Чат</h3>
                  <div className="h-48 overflow-y-auto bg-gray-100 rounded-xl p-3 mb-3 space-y-2">
                    {messages.map((msg, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-lg shadow">
                        <span className="font-bold text-purple-700 text-base">{msg.playerName}:</span>{" "}
                        <span className="text-gray-900 font-medium text-base">{msg.message}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Панель эмодзи */}
                  {showEmojiPicker && (
                    <div className="bg-white border-2 border-purple-300 rounded-xl p-3 mb-2 max-h-32 overflow-y-auto">
                      <div className="grid grid-cols-10 gap-1">
                        {spicyEmojis.map((emoji, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleEmojiClick(emoji)}
                            className="text-2xl hover:scale-125 transition"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="px-4 py-3 bg-purple-100 text-purple-600 font-bold rounded-xl hover:bg-purple-200 transition text-2xl"
                    >
                      😊
                    </button>
                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                      placeholder="Сообщение..."
                      className="flex-1 p-3 border-2 border-purple-300 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 font-medium"
                    />
                    <button
                      onClick={handleSendMessage}
                      className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:scale-105 transition"
                    >
                      📤
                    </button>
                  </div>
                </div>
              </div>

              {/* ПРАВАЯ КОЛОНКА - Игроки с видео и управлением */}
              <div className="space-y-4">
                <div className="bg-white/95 rounded-2xl p-6 shadow-2xl">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">👥 Игроки (всегда видны)</h3>
                  <div className="space-y-3">
                    {players.map((player) => (
                      <div
                        key={player.id}
                        className={`border-2 rounded-xl p-3 transition ${
                          currentPlayer === player.id
                            ? "border-purple-500 bg-purple-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        {/* Видео игрока */}
                        <div className="w-full h-32 bg-gray-900 rounded-lg mb-2 flex items-center justify-center text-gray-500">
                          📹 Видео {player.name}
                        </div>

                        {/* Инфо игрока */}
                        <div className="flex items-center gap-2 mb-2">
                          {player.avatarType === "image" ? (
                            <img 
                              src={player.avatar} 
                              alt={player.name}
                              className="w-10 h-10 rounded-full object-cover border-2 border-purple-500"
                            />
                          ) : (
                            <div className="text-2xl">{player.avatar}</div>
                          )}
                          <div className="flex-1">
                            <div className="font-bold text-gray-800">{player.name}</div>
                            <div className="text-sm text-gray-600">
                              {player.gender === "male" ? "👨 М" : "👩 Ж"}
                            </div>
                          </div>
                          <div className="text-2xl font-bold text-purple-600">
                            {player.score}
                          </div>
                        </div>

                        {/* Управление */}
                        <div className="space-y-2">
                          {/* Баллы */}
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleUpdateScore(player.id, 1)}
                              className="flex-1 py-1 bg-green-500 text-white text-sm font-bold rounded hover:bg-green-600"
                            >
                              +1
                            </button>
                            <button
                              onClick={() => handleUpdateScore(player.id, 5)}
                              className="flex-1 py-1 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-700"
                            >
                              +5
                            </button>
                            <button
                              onClick={() => handleUpdateScore(player.id, -1)}
                              className="flex-1 py-1 bg-red-500 text-white text-sm font-bold rounded hover:bg-red-600"
                            >
                              -1
                            </button>
                            <button
                              onClick={() => handleUpdateScore(player.id, -5)}
                              className="flex-1 py-1 bg-red-600 text-white text-sm font-bold rounded hover:bg-red-700"
                            >
                              -5
                            </button>
                          </div>

                          {/* Звук */}
                          <button
                            onClick={() => handleMutePlayer(player.id)}
                            className={`w-full py-2 font-bold rounded ${
                              mutedPlayers[player.id]
                                ? "bg-red-500 text-white"
                                : "bg-blue-500 text-white"
                            }`}
                          >
                            {mutedPlayers[player.id] ? "🔇 Откл" : "🔊 Вкл"}
                          </button>

                          {/* Выбрать игрока вручную */}
                          {!autoMode && (
                            <button
                              onClick={() => handleSelectPlayer(player.id)}
                              disabled={currentPlayer === player.id}
                              className="w-full py-2 bg-purple-500 text-white font-bold rounded hover:bg-purple-600 disabled:opacity-50"
                            >
                              👉 Выбрать
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {players.length === 0 && (
                      <div className="text-center text-gray-500 py-8">
                        Нет игроков
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ОБЫЧНАЯ СТРАНИЦА ДЛЯ ИГРОКОВ
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-500 via-purple-500 to-red-500 flex items-center justify-center p-4">
        <div className="bg-white/95 rounded-3xl p-8 shadow-2xl max-w-2xl w-full">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
            🎮 Лобби
          </h1>

          <div className="space-y-3 mb-6">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-4 p-4 bg-gradient-to-r from-pink-100 to-purple-100 rounded-xl"
              >
                {player.avatarType === "image" ? (
                  <img 
                    src={player.avatar} 
                    alt={player.name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-purple-500"
                  />
                ) : (
                  <div className="text-4xl">{player.avatar}</div>
                )}
                <div className="flex-1">
                  <div className="font-bold text-gray-800">{player.name}</div>
                  <div className="text-sm text-gray-600">
                    {player.gender === "male" ? "👨 Парень" : "👩 Девушка"}
                  </div>
                </div>
                {player.isReady && (
                  <div className="text-green-600 font-bold">✓ Готов</div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleReady}
            className="w-full py-4 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold text-lg rounded-xl shadow-lg hover:scale-105 transition"
          >
            ✓ Я готов!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-500 via-purple-500 to-red-500 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white text-center mb-6">
          🍾 Бутылочка
        </h1>

        {/* Круглый стол с бутылочкой */}
        <div className="bg-white/90 rounded-3xl p-8 mb-6 shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">🍾 Стол</h2>
            <div className="flex gap-2">
              <button
                onClick={toggleCamera}
                className={`px-4 py-2 rounded-xl font-bold ${
                  cameraEnabled ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'
                } hover:scale-105 transition`}
              >
                {cameraEnabled ? '📹 Камера Вкл' : '📹 Камера Откл'}
              </button>
              {!currentPlayer && (
                <button
                  onClick={handleSpin}
                  disabled={spinning}
                  className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold rounded-xl hover:scale-105 transition disabled:opacity-50"
                >
                  {spinning ? 'Вращается...' : '🔄 Крутить'}
                </button>
              )}
            </div>
          </div>
          <div className="relative w-full aspect-square bg-gradient-to-br from-amber-700 via-amber-600 to-amber-800 rounded-full flex items-center justify-center shadow-inner" style={{ maxHeight: "500px" }}>
            {/* Круглый стол */}
            <div className="absolute inset-4 bg-gradient-to-br from-amber-800 to-amber-900 rounded-full shadow-2xl"></div>
            
            {/* Игроки по кругу с камерами */}
            {players.map((player, index) => {
              const angle = (index / players.length) * 2 * Math.PI - Math.PI / 2;
              const radius = 42;
              const x = 50 + radius * Math.cos(angle);
              const y = 50 + radius * Math.sin(angle);
              const isMe = player.id === myId;
              
              return (
                <div
                  key={player.id}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
                    currentPlayer === player.id ? 'scale-125 z-10' : 'scale-100'
                  } transition-all duration-300`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div className={`relative ${currentPlayer === player.id ? 'animate-pulse' : ''}`}>
                    {/* КАМЕРА ИЛИ АВАТАР */}
                    <div className="relative w-20 h-20">
                      {isMe && cameraEnabled ? (
                        <video
                          ref={localVideoRef}
                          autoPlay
                          muted
                          className={`w-20 h-20 rounded-full object-cover border-4 ${
                            currentPlayer === player.id ? 'border-pink-500' : 'border-white'
                          } shadow-xl`}
                        />
                      ) : player.avatarType === "image" ? (
                        <img 
                          src={player.avatar} 
                          alt={player.name}
                          className={`w-20 h-20 rounded-full object-cover border-4 ${
                            currentPlayer === player.id ? 'border-pink-500' : 'border-white'
                          } shadow-xl`}
                        />
                      ) : (
                        <div className={`w-20 h-20 bg-white rounded-full flex items-center justify-center text-5xl border-4 ${
                          currentPlayer === player.id ? 'border-pink-500' : 'border-white'
                        } shadow-xl`}>
                          {player.avatar}
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-7 left-1/2 transform -translate-x-1/2 bg-white px-3 py-1 rounded-full shadow-lg text-sm font-bold text-gray-800 whitespace-nowrap">
                      {player.name}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Бутылочка в центре */}
            <div 
              className="absolute text-7xl transition-transform duration-2000 ease-out z-20"
              style={{ 
                transform: `rotate(${bottleRotation}deg)`,
                transitionDuration: spinning ? '2000ms' : '0ms'
              }}
            >
              🍾
            </div>
          </div>

          {/* Модальное окно выбора Правда/Действие */}
          {showChoice && currentPlayer === myId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
                <h2 className="text-3xl font-bold text-center mb-6 text-gray-800">
                  Твой ход! 🎯
                </h2>
                {myTruthStreak >= 3 ? (
                  <p className="text-center text-red-600 font-bold mb-8">
                    Ты выбрал "Правду" 3 раза подряд!<br/>Теперь только "Действие" 🔥
                  </p>
                ) : (
                  <p className="text-center text-gray-600 mb-8">
                    Выбери: {myTruthStreak > 0 && `(Правда: ${myTruthStreak}/3)`}
                  </p>
                )}
                <div className="flex gap-4">
                  <button
                    onClick={() => handleChooseType("truth")}
                    disabled={myTruthStreak >= 3}
                    className={`flex-1 py-6 font-bold text-xl rounded-xl transition shadow-lg ${
                      myTruthStreak >= 3 
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:scale-105'
                    }`}
                  >
                    🤔 Правда
                  </button>
                  <button
                    onClick={() => handleChooseType("dare")}
                    className="flex-1 py-6 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-xl rounded-xl hover:scale-105 transition shadow-lg"
                  >
                    🔥 Действие
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Текущее задание */}
          {currentTask && (
            <div className="mt-6 p-6 bg-gradient-to-r from-pink-500 to-purple-500 rounded-2xl text-white">
              <h3 className="text-2xl font-bold mb-2">
                {taskType === "truth" ? "🤔 Правда" : taskType === "dare" ? "🔥 Действие" : "📝 Задание"}
              </h3>
              <p className="text-xl mb-4">{currentTask}</p>

              {currentPlayer === myId && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleTaskComplete(true)}
                    className="flex-1 py-3 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-700"
                  >
                    ✓ Выполнил
                  </button>
                  <button
                    onClick={() => handleTaskComplete(false)}
                    className="flex-1 py-3 bg-gray-600 text-white font-bold text-lg rounded-xl hover:bg-gray-700"
                  >
                    ✗ Не выполнил
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Игроки и видео */}
          <div className="bg-white/90 rounded-3xl p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              👥 Игроки
            </h2>

            {/* Мое видео */}
            <div className="mb-4">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                className="w-full h-48 bg-gray-900 rounded-xl object-cover"
              />
              <p className="text-center text-gray-700 font-bold mt-2">Ты</p>
            </div>

            {/* Список игроков */}
            <div className="space-y-3">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    currentPlayer === player.id
                      ? "bg-gradient-to-r from-pink-200 to-purple-200 border-2 border-purple-500"
                      : "bg-gray-100"
                  }`}
                >
                  {player.avatarType === "image" ? (
                    <img 
                      src={player.avatar} 
                      alt={player.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-purple-500"
                    />
                  ) : (
                    <div className="text-3xl">{player.avatar}</div>
                  )}
                  <div className="flex-1">
                    <div className="font-bold text-gray-800">{player.name}</div>
                    <div className="text-sm text-gray-600">
                      {player.gender === "male" ? "👨 М" : "👩 Ж"}
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-purple-600">
                    {player.score}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Чат */}
          <div className="bg-white/90 rounded-3xl p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">💬 Чат</h2>

            <div className="h-96 overflow-y-auto bg-gray-100 rounded-2xl p-4 mb-4 space-y-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className="bg-white p-4 rounded-xl shadow"
                >
                  <span className="font-bold text-purple-700 text-lg">{msg.playerName}:</span>{" "}
                  <span className="text-gray-900 font-medium text-lg">{msg.message}</span>
                </div>
              ))}
            </div>

            {/* Панель эмодзи */}
            {showEmojiPicker && (
              <div className="bg-white border-2 border-purple-300 rounded-xl p-4 mb-3 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-8 gap-2">
                  {spicyEmojis.map((emoji, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleEmojiClick(emoji)}
                      className="text-3xl hover:scale-125 transition"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="px-4 py-3 bg-purple-100 text-purple-600 font-bold rounded-xl hover:bg-purple-200 transition text-2xl"
              >
                😊
              </button>
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Напиши сообщение..."
                className="flex-1 p-3 border-2 border-purple-300 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 font-medium"
              />
              <button
                onClick={handleSendMessage}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold text-lg rounded-xl hover:scale-105 transition"
              >
                📤
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
