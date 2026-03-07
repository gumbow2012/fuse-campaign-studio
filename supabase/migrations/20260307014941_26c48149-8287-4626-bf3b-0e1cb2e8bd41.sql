CREATE POLICY "worker_insert_projects" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "worker_update_projects" ON projects FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "worker_select_projects" ON projects FOR SELECT USING (true);