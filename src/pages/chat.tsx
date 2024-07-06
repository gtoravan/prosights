import React, { useState, useEffect } from 'react';
import { trpc } from '../utils/trpc';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { signIn, signOut, useSession } from 'next-auth/react';

const PersonIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 12c2.21 0 4-1.79 4-4S14.21 4 12 4 8 5.79 8 8s1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

const RobotIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="9" width="20" height="13" rx="2" ry="2" />
    <path d="M16 7V4H8v3" />
    <path d="M9 18h6" />
    <path d="M11 14h2" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

type ChatMessage = {
  sender: 'user' | 'bot';
  message: string;
};

const ChatPage = () => {
  const { data: session } = useSession();
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [documents, setDocuments] = useState<{ name: string; path: string; }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState<string | ArrayBuffer | null>(null);

  const sendMessage = trpc.post.sendMessage.useMutation();
  const uploadMutation = trpc.post.upload.useMutation();
  const listDocuments = trpc.post.listDocuments.useQuery();

  useEffect(() => {
    if (listDocuments.data) {
      setDocuments(listDocuments.data);
    }
  }, [listDocuments.data]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      listDocuments.refetch();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [listDocuments]);

  const handleSendMessage = async () => {
    if (message.trim() === '') return;

    const newMessage: ChatMessage = { sender: 'user', message };
    setChatHistory([...chatHistory, newMessage]);

    const response = await sendMessage.mutateAsync({ message });

    setChatHistory((prevChatHistory) => [
      ...prevChatHistory,
      { sender: 'bot', message: response.response },
    ]);

    setMessage('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setContent(event.target.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (file && content) {
      const base64Content = (content as string).split(',')[1]; // Remove data URL prefix
      await uploadMutation.mutateAsync({ filename: file.name, content: base64Content });
      // Refresh document list
      await listDocuments.refetch();
    }
  };

  if (!session?.user) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-lg">You need to sign in to use the chat</p>
          <Button onClick={() => signIn()}>Sign In</Button>
        </div>
      </div>
    );
  }

  const userName = session.user.name ?? 'User';
  const userEmail = session.user.email ?? 'No email';

  return (
    <div className="flex h-[100dvh] w-full flex-col">
      <header className="flex items-center justify-between bg-background px-4 py-3 shadow-sm md:px-6">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={session.user.image || '/placeholder-user.jpg'} />
            <AvatarFallback>{userName[0]}</AvatarFallback>
          </Avatar>
          <div className="grid gap-0.5 text-sm">
            <div className="font-medium">{userName}</div>
            <div className="text-muted-foreground">{userEmail}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <PaperclipIcon className="h-5 w-5" />
            <span className="sr-only">Attach file</span>
          </Button>
          <Button variant="ghost" size="icon">
            <MoveHorizontalIcon className="h-5 w-5" />
            <span className="sr-only">More options</span>
          </Button>
          <Button onClick={() => signOut()}>Logout</Button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {chatHistory.map((chat, index) => (
            <div
              className={`flex items-start gap-4 ${
                chat.sender === 'user' ? 'justify-end' : ''
              }`}
              key={index}
            >
              {chat.sender === 'bot' && (
                <Avatar className="w-6 h-6 border">
                  <RobotIcon />
                </Avatar>
              )}
              <div className="grid gap-1">
                <div className="font-bold">{chat.sender === 'user' ? 'You' : 'ChatGPT'}</div>
                <div className="prose text-muted-foreground">
                  <p>{chat.message}</p>
                </div>
              </div>
              {chat.sender === 'user' && (
                <Avatar className="w-6 h-6 border">
                  <PersonIcon />
                </Avatar>
              )}
            </div>
          ))}
        </div>
        <div className="w-[300px] border-l bg-background p-4 md:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Uploaded Documents</h3>
            <input type="file" onChange={handleFileChange} />
            <Button onClick={handleUpload} variant="ghost" size="icon">
              <PlusIcon className="h-5 w-5" />
              <span className="sr-only">Add document</span>
            </Button>
          </div>
          <div className="mt-4 space-y-4">
            {documents.map((doc, index) => (
              <div className="flex items-center gap-3" key={index}>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{doc.name}</div>
                </div>
                <Button variant="ghost" size="icon">
                  <DownloadIcon className="h-5 w-5" />
                  <span className="sr-only">Download document</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-2xl w-full sticky bottom-0 mx-auto py-2 flex flex-col gap-1.5 px-4 bg-background">
        <div className="relative">
          <Textarea
            placeholder="Message ChatGPT..."
            name="message"
            id="message"
            rows={1}
            className="min-h-[48px] rounded-2xl resize-none p-4 border border-neutral-400 shadow-sm pr-16"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute w-8 h-8 top-3 right-3"
            onClick={handleSendMessage}
            disabled={!message.trim()}
          >
            <ArrowUpIcon className="w-4 h-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
        <p className="text-xs font-medium text-center text-neutral-700">
          ChatGPT can make mistakes. Consider checking important information.
        </p>
      </div>
    </div>
  );
};
function ArrowUpIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}

function ClipboardIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function DownloadIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function FileIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function MoveHorizontalIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="18 8 22 12 18 16" />
      <polyline points="6 8 2 12 6 16" />
      <line x1="2" x2="22" y1="12" y2="12" />
    </svg>
  );
}

function PaperclipIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function PlusIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function RefreshCcwIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function ThumbsDownIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

function ThumbsUpIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1-3 3.88Z" />
    </svg>
  );
}

export default ChatPage;
