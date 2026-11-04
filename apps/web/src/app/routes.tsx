import { Outlet, type RouteObject } from 'react-router';
import { Toaster } from '../components/Toaster';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ProtectedRoute, PublicOnlyRoute } from '../features/auth/route-guards';
import { SignInPage } from '../features/auth/SignInPage';
import { BoardPage } from '../features/board/BoardPage';
import { CardDetailRoute } from '../features/card/CardDetailRoute';
import { MyBoardsPage } from '../features/boards/MyBoardsPage';
import { InviteAcceptPage } from '../features/sharing/InviteAcceptPage';
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
          {
            path: '/b/:boardId',
            element: <BoardPage />,
            // A child route, so the board and its socket stay open behind the card modal.
            children: [{ path: 'c/:cardId', element: <CardDetailRoute /> }],
          },
          { path: '/invite/:token', element: <InviteAcceptPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
