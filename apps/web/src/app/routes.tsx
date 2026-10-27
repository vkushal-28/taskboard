import { Outlet, type RouteObject } from 'react-router';
import { Toaster } from '../components/Toaster';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ProtectedRoute, PublicOnlyRoute } from '../features/auth/route-guards';
import { SignInPage } from '../features/auth/SignInPage';
import { BoardPage } from '../features/board/BoardPage';
import { MyBoardsPage } from '../features/boards/MyBoardsPage';
import { NotFoundPage } from './NotFoundPage';

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}

// Exported separately from the browser router so tests can mount them in a memory router.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
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
    ],
  },
];
