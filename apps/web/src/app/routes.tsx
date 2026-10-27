import type { RouteObject } from 'react-router';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ProtectedRoute, PublicOnlyRoute } from '../features/auth/route-guards';
import { SignInPage } from '../features/auth/SignInPage';
import { BoardPage } from '../features/boards/BoardPage';
import { MyBoardsPage } from '../features/boards/MyBoardsPage';
import { NotFoundPage } from './NotFoundPage';

// Exported separately from the browser router so tests can mount them in a memory router.
export const routes: RouteObject[] = [
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <SignInPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <MyBoardsPage /> },
      { path: '/b/:boardId', element: <BoardPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
