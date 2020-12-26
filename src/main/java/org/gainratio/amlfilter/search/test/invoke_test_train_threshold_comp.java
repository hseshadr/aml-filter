/*
 * Copyright (C) 2010 AMLFilter LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.gainratio.amlfilter.search.test;

import org.gainratio.amlfilter.search.vectorSpace.Hierarchy_utils;


public final class invoke_test_train_threshold_comp {

    private static final String baseDir = "/opt/amlfilter/data/06_test_demo_ALL/";

    private static final Hierarchy_utils hu = new Hierarchy_utils();

    /**
     * @param args
     */
    public static void main(String[] args) throws Exception {
        // Spring loader for the beans
		/*
        XmlBeanFactory beanFactory = new XmlBeanFactory(new FileSystemResource("/opt/amlfilter/tomcat_amlf-admin/webapps/amlf-engine/WEB-INF/applicationContext.xml"));
        PropertyPlaceholderConfigurer cfg = new PropertyPlaceholderConfigurer();
        cfg.setLocation(new FileSystemResource("/opt/amlfilter/tomcat_amlf-admin/webapps/amlf-engine/WEB-INF/admin-config.properties"));
        cfg.postProcessBeanFactory(beanFactory);
        Tree_VectorSpaceSearch tree_VectorSpaceSearch
        					= (Tree_VectorSpaceSearch) beanFactory.getBean("tree_vectorSpaceSearch");

        Properties props = tree_VectorSpaceSearch.getMap_Key_FileName();
        Iterator fileNamesIterator = props.values().iterator();
        String[] fileNames = new String[1];
        while (fileNamesIterator.hasNext())
        {
        	fileNames[0] = (String) fileNamesIterator.next();

        	new test_train_threshold_comp().main(fileNames);
        }
        */

    }
}


