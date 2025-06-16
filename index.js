import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import {configDotenv} from "dotenv";
import { execSync } from 'child_process';

configDotenv();

const app = express();

const corsOptions = {
	origin: "*",
	credentials: true,
	optionSuccessStatus: 200,
};

app.use(express.json());
app.use(cors(corsOptions));

const server = http.createServer(app);

const io = new Server(server, {
	cors: {
		origin: "*",
	},
	pingTimeout: 5000,      // клиент должен ответить за 5 сек
	pingInterval: 2500      // проверять каждые 2.5 сек
});

let users = [];
let userQueue = [];

let activeUser = null;
let activeQuestion = null;

let lastAnsweredUser = null;

const changeUser = () => {
	let index = userQueue.indexOf(activeUser) + 1;

	if (index === userQueue.length) {
		index = 0;
		activeUser = userQueue[index];
		return;
	}

	activeUser = userQueue[index];
};

io.on("connection", (socket) => {
	console.log("socket connected", socket.id);

	socket.on("setGame", async (game) => {
		io.emit("getGameStyle", game.style?.path, game.style?.color_theme);
	});

	// Подключение к игре
	socket.on("joinGame", async (user) => {

		socket.data.user = user;

		if (user.username && !users.find((el) => el.username === user.username)) {
			user.status = "connected";
			users.push(user);
			socket.emit("myUser", user);
		} else {
			users.map((el) => el.username === user.username ? el.status = "connected" : null);
			socket.emit(
				"myUser",
				users.find((el) => el.username === user.username)
			);
		}

		const selectedGame = await axios.get(`${process.env.BACKEND_API}/games/current`);
		socket.emit("getGameStyle", selectedGame.data.style?.path, selectedGame.data.style?.color_theme);

		// Возвращает всех подключённых пользователей
		io.emit("all", users);
		io.emit("setActiveQuestion", activeQuestion, userQueue, lastAnsweredUser);
	});

	// Изменение отвечающего пользователя
	socket.on("changeUser", () => {
		changeUser();
		// Возвращает нового отвечающего пользователя
		io.emit("newActiveUser", activeUser);
	});

	// Добавление очков
	socket.on("addPoints", ({ activeUser, points }) => {
		if (activeUser && +points) {
			users.find((el) => el.username === activeUser?.username).points += +points;
			lastAnsweredUser = users.find((el) => el.username === activeUser.username);
			userQueue = [];
		} else {
			lastAnsweredUser = null;
		}

		// Возвращение обновленного списка игроков
		io.emit("newUserList", users, lastAnsweredUser);
	});

	//Переназначение очков
	socket.on("reassignPoints", ({ lastAnsweredUser, userToReass, points }) => {
		if (lastAnsweredUser === null) {
			users.find((el) => el.username === userToReass?.username).points += +points;
		} else if (userToReass !== null) {
			users.find((el) => el.username === userToReass?.username).points += +points;
			users.find((el) => el.username === lastAnsweredUser?.username).points -=
				+points;
		} else {
			users.find((el) => el.username === lastAnsweredUser?.username).points -= +points;
		}

		// Возвращение обновленного списка игроков
		io.emit("newUserList", users, userToReass);
	});

	// Выбор вопроса
	socket.on("selectQuestion", (question) => {
		activeQuestion = question;
		lastAnsweredUser = null;
		activeUser = null;

		// Возвращает выбранный вопрос на клиент
		io.emit("setActiveQuestion", activeQuestion, userQueue, lastAnsweredUser, activeUser);
	});

	socket.on("closeQuestion", () => {
		activeQuestion = null;
		userQueue = [];
		activeUser = null;
		io.emit("setActiveQuestion", activeQuestion, userQueue, lastAnsweredUser, activeUser);
	});

	// Срабатывает когда пользователь жмёт на кнопку ответить
	socket.on("answerQuestion", (user) => {
		userQueue.push(user);

		if (!activeUser) {
			activeUser = userQueue[0];

			// Возвращает нового отвечающего пользователя
			io.emit("getActiveUser", activeUser);
		}

		// Возвращает список нажавших на кнопку пользователей
		io.emit("getQueue", userQueue);
	});

	socket.on("endGame", () => {
		users.map(user => user.points = 0);
		userQueue = [];
		activeUser = null;
		activeQuestion = null;
		lastAnsweredUser = null;
		io.emit("endGame")
	});

	// Отключение от сервера
	socket.on("disconnecting", () => {
		console.log(`Пользователь ${socket.id} отключается`);
		users.map((el) => el.username === socket.data.user?.username ? el.status = "disconnected" : null);
		// Возвращает всех подключённых пользователей
		io.emit("all", users)
	});

	socket.on("disconnect", () => {
		console.log(`Сокет ${socket.id} отключился`);
		io.emit("all", users);
	});

	socket.on("manualDisconnect", () => {
		const username = socket.data.user?.username;

		if (username) {
			users = users.map((el) =>
				el.username === username ? { ...el, status: "disconnected" } : el
			);

			io.emit("all", users);
			console.log(`Пользователь ${username} покинул игру через стрелку назад`);
		}
	});
});

// API
app.get("/", (res) => {
	res.send("API");
});

const PORT = 3800;

// убиваем процесс, который занят этим портом
try {
	const stdout = execSync(`npx kill-port ${PORT}`);
	console.log(`🔪 Освобожден порт ${PORT}`);
} catch (e) {
	console.log(`🟡 Порт ${PORT} и так свободен`);
}

// твой сервер запускается после этого
server.listen(PORT, () => {
	console.log(`✅ Сервер запущен на порту ${PORT}`);
});