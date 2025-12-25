require("dotenv").config();
const config = require("./config.json");
const mongoose = require("mongoose");

mongoose.connect(config.connectionString);

const User = require("./models/user.model");
const Note = require("./models/note.model");

const express = require("express");
const cors = require("cors");
const app = express();

const jwt = require("jsonwebtoken");
const { authenticateToken } = require("./utilities");

app.use(express.json());

app.use(
  cors({
    origin: "*",
  })
);

app.post("/create-account", async (req, res) => {
  const { fullName, email, password } = req.body;
  if (!fullName) {
    return res
      .status(400)
      .json({ error: true, message: "Full name is required!" });
  }
  if (!email) {
    return res.status(400).json({ error: true, message: "Email is required!" });
  }
  if (!password) {
    return res
      .status(400)
      .json({ error: true, message: "Password is required!" });
  }

  const isUser = await User.findOne({ email: email });
  if (isUser) {
    return res.json({ error: true, message: "User already exist" });
  }

  const newUser = new User({
    fullName,
    email,
    password,
  });

  await newUser.save();

  const accessToken = jwt.sign(
    { _id: newUser._id, email: newUser.email },
    process.env.JWT_SECRET,
    {
      expiresIn: "3600m",
    }
  );

  return res.json({
    error: false,
    newUser,
    accessToken,
    message: " Registration Successful",
  });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: true, message: "Email is required!" });
  }
  if (!password) {
    return res
      .status(400)
      .json({ error: true, mesage: "Password is required!" });
  }
  const userInfo = await User.findOne({ email: email });
  if (!userInfo) {
    return res.json({ error: true, message: "User not found!" });
  }
  if (userInfo.email === email && userInfo.password === password) {
    const user = { _id: userInfo._id, email: userInfo.email };
    const accessToken = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: "3600m",
    });
    return res.json({
      error: false,
      email,
      accessToken,
      message: "Login Successful",
    });
  } else {
    return res
      .status(400)
      .json({ error: true, message: "Invalid Credentials" });
  }
});

// Get User for Profile Info

app.get("/get-user", authenticateToken, async (req, res) => {
  //const user = req.user;

  const isUser = await User.findOne({ _id: req.user._id });

  if (!isUser) {
    return res.sendStatus(401);
  }
  return res.json({
    user: {
      fullName: isUser.fullName,
      email: isUser.email,
      _id: isUser._id,
      createdOn: isUser.createdOn,
    },
    message: "",
  });
});

app.post("/add-note", authenticateToken, async (req, res) => {
  const { title, content, tags, isPinned } = req.body;
  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }
  if (!content) {
    return res.status(400).json({ message: "Content is required" });
  }

  try {
    const note = new Note({
      title,
      content,
      tags: tags || [],
      isPinned: isPinned || false,
      userId: req.user._id,
    });

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note added successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
});

app.put("/edit-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { title, content, tags, isPinned } = req.body;

  if (!title && !content && !tags) {
    return res
      .status(400)
      .json({ error: true, message: "No changes provided!" });
  }

  try {
    const note = await Note.findOne({
      _id: noteId,
      userId: req.user._id.toString(),
    });

    if (!note) {
      return res.status(404).json("No note found!");
    }

    // if (note.userId.toString() !== req.user._id.toString()) {        //-> This is for authorization
    //   return res.status(403).json({ error: true, message: "Forbidden" });
    // }

    if (title) note.title = title;
    if (content) note.content = content;
    if (tags) note.tags = tags;
    if (typeof isPinned === "boolean") note.isPinned = isPinned;

    await note.save();

    return res.status(200).json({
      error: false,
      note,
      message: "Note updated successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
});

app.delete("/delete-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  try {
    const deletedNote = await Note.findOneAndDelete({
      _id: noteId,
      userId: req.user._id.toString(),
    });

    if (!deletedNote) {
      return res.status(404).json({
        error: true,
        message: "Note not found or you are not authorized!",
      });
    }

    return res.status(200).json({
      error: false,
      message: "Note deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
});

app.get("/get-all-notes", authenticateToken, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user._id.toString() }).sort({
      isPinned: -1,
    });
    if (notes.length === 0) {
      return res.status(200).json({
        error: false,
        notes: [],
        message: "No notes found",
      });
    }
    return res.status(200).json({
      error: false,
      notes,
      message: "Notes fetched successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
});

app.put("/update-note-pinned/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { isPinned } = req.body;
  try {
    const updatedNote = await Note.findOneAndUpdate(
      { _id: noteId, userId: req.user._id },
      { $set: { isPinned: isPinned } },
      { new: true }
    );
    if (!updatedNote) {
      return res.status(404).json({
        error: true,
        message: "Note not found!",
      });
    }
    return res.status(200).json({
      error: false,
      note: updatedNote,
      message: "Pin value changed successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: false,
      message: "Internal server error",
    });
  }
});

app.get("/search-notes/", authenticateToken, async (req, res) => {
  const user = req.user;
  const { query } = req.query;
  if (!query) {
    return res
      .status(400)
      .json({ error: true, message: "Search query is required!" });
  }
  try {
    const matchingNotes = await Note.find({
      userId: user._id,
      $or: [
        { title: { $regex: new RegExp(query, "i") } },
        { content: { $regex: new RegExp(query, "i") } },
      ],
    });
    return res.json({
      error: false,
      notes: matchingNotes,
      message: "Searched notes retrieved successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: " Internal server error",
    });
  }
});

app.listen(8000, () => console.log("Server is running on port 8000"));

module.exports = app;
