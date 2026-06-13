UPDATE "Attendance" a
SET branch = (
  SELECT b."branchName"
  FROM "Employee" e
  LEFT JOIN "Branch" b ON e."branchId" = b.id
  WHERE e.id = a."employeeId"
);
