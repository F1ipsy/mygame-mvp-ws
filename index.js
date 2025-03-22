import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import {configDotenv} from "dotenv";

const corsOptions = {
	origin: "*",
	credentials: true,
	optionSuccessStatus: 200,
};

configDotenv();

const app = express();

app.use(express.json());
app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: "*",
	},
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

	// Подключение к игре
	socket.on("joinGame", async (user) => {

		socket.data.user = user;

		if (!users.find((el) => el.username === user.username)) {
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
		io.emit("setActiveQuestion", activeQuestion);
	});

	// Изменение отвечающего пользователя
	socket.on("changeUser", () => {
		changeUser();
		// Возвращает нового отвечающего пользователя
		io.emit("newActiveUser", activeUser);
	});

	socket.on("closeQuestion", () => {
		activeQuestion = null;
		userQueue = [];
		io.emit("setActiveQuestion", activeQuestion);
	});

	// Добавление очков
	socket.on("addPoints", ({ activeUser, points }) => {
		if (activeUser && +points) {
			users.find((el) => el.username === activeUser.username).points += +points;
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
			users.find((el) => el.username === userToReass.username).points += +points;
		} else {
			users.find((el) => el.username === userToReass.username).points += +points;
			users.find((el) => el.username === lastAnsweredUser.username).points -=
				+points;
		}

		// Возвращение обновленного списка игроков
		io.emit("newUserList", users, userToReass);
	});

	// Выбор вопроса
	socket.on("selectQuestion", (question) => {
		activeQuestion = question;

		// Возвращает выбранный вопрос на клиент
		io.emit("setActiveQuestion", activeQuestion);
	});

	// Срабатывает когда пользователь жмёт на кнопку ответить
	socket.on("answerQuestion", (user) => {
		if (userQueue.find((el) => el.username === user.username)) {
			return;
		}

		userQueue.push(user);

		if (!activeUser) {
			activeUser = userQueue[0];

			// Возвращает нового отвечающего пользователя
			io.emit("getActiveUser", activeUser);
		}

		// Возвращает список нажавших на кнопку пользователей
		io.emit("getQueue", userQueue);
	});

	// Отключение от сервера
	socket.on("disconnecting", () => {
		users.map((el) => el.username === socket.data.user.username ? el.status = "disconnected" : null)
		console.log(`Пользователь ${socket.id} отключается`);
		// Возвращает всех подключённых пользователей
		io.emit("all", users);
	});
});

// API
app.get("/", (res) => {
	res.send("API");
});

server.listen(3800, () => {
	console.log("SERVER START");
});
