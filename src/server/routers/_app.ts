import { router, publicProcedure } from '../trpc';
import { postRouter } from './post';
import { chatRouter } from './chat'; // Import the chatRouter
import { observable } from '@trpc/server/observable';
import { clearInterval } from 'timers';

console.log("Registering routers..."); // Add logging
console.log("Chat Router:", chatRouter); // Add logging

export const appRouter = router({
  healthcheck: publicProcedure.query(() => 'yay!'),

  post: postRouter,
  chat: chatRouter, // Add the chatRouter

  randomNumber: publicProcedure.subscription(() => {
    return observable<number>((emit) => {
      const int = setInterval(() => {
        emit.next(Math.random());
      }, 500);
      return () => {
        clearInterval(int);
      };
    });
  }),
});

console.log("App Router:", appRouter); // Add logging

export type AppRouter = typeof appRouter;
